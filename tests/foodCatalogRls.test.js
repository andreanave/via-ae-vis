// Catalogo alimentare condiviso: chi legge, chi inserisce, verifica del master, duplicati e versioni.
// Scenario 7: un prodotto inserito al supermercato è subito usabile e il master lo ritrova da verificare.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ids = {
  athlete: "00000000-0000-0000-0000-00000000010a",
  coach: "00000000-0000-0000-0000-00000000010c",
  other: "00000000-0000-0000-0000-00000000010f",
  master: "00000000-0000-0000-0000-0000000001ff",
};
let db;

const as = async (key, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ids[key]}', false);
    select set_config('request.jwt.claim.email', '${key}@test.local', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const rows = async (key, sql, params) => as(key, async () => (await db.query(sql, params)).rows);
const addFood = (key, food, vals) =>
  rows(key, "select add_food($1, $2) as id", [JSON.stringify(food), JSON.stringify(vals)]).then(r => r[0].id);

// Foto di un'etichetta caricata dall'utente nella propria cartella del bucket food-labels.
const upload = async (key, file) => {
  const path = `${ids[key]}/${file}`;
  await rows(key, "insert into storage.objects (bucket_id, name) values ('food-labels', $1)", [path]);
  return path;
};

const piadina = { name: "Piadina", brand: "Marca Prova", variant: "Classica", unit_weight_g: 120 };
const piadinaVals = { kcal: 300, protein_g: 8, carbs_g: 48, fat_g: 8.5, salt_g: 1.6, provenance: "manual" };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("tests/supabaseStub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  }
  for (const [key, id] of Object.entries(ids)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
      [id, `${key}@test.local`, JSON.stringify({ full_name: key })]);
  }
  await db.exec(`update profiles set role = 'professional' where id in ('${ids.coach}', '${ids.other}');
    update profiles set is_master = true where id = '${ids.master}';`);
});

describe("catalogo: lettura e inserimento", () => {
  it("le tabelle CREA sono caricate con fonte, stato e valori per 100 g", async () => {
    const [{ n, senza }] = await rows("athlete", `select count(*)::int n, count(*) filter (where current_version_id is null)::int senza
      from foods where source = 'crea'`);
    expect(n).toBe(832);
    expect(senza).toBe(0);
    const found = await rows("athlete", "select * from search_foods('farro perlato crudo')");
    expect(found[0]).toMatchObject({ name: "Farro perlato, crudo", source: "crea", status: "verified", state: "raw", basis: "g" });
    expect(Number(found[0].kcal)).toBe(353);
    const [tonno] = await rows("athlete", "select state, edible_part_pct from foods where source_ref = '123610'");
    expect(tonno.state).toBe("drained");
    // Accenti ripristinati, il nome originale resta come sinonimo.
    expect((await rows("athlete", "select name from search_foods('babà rhum')"))[0].name).toBe("Babà al rhum");
    expect((await rows("athlete", "select name from search_foods('baba'' al rhum')"))[0].name).toBe("Babà al rhum");
    const [v] = await rows("athlete", `select v.provenance, v.note from foods f join food_versions v on v.id = f.current_version_id
      where f.source_ref = '000020'`);
    expect(v.provenance).toBe("import");
    expect(v.note).toMatch(/CREA/);
  });

  it("anon non legge il catalogo", async () => {
    await db.exec("set role anon;");
    await expect(db.query("select * from foods")).rejects.toThrow();
    await db.exec("reset role;");
  });

  it("un atleta non scrive direttamente nel catalogo", async () => {
    await expect(rows("athlete", `insert into foods (kind, name, source) values ('branded', 'X', 'manual')`)).rejects.toThrow();
    await expect(rows("athlete", "update foods set name = 'Hack'")).resolves.toEqual([]);
    expect((await rows("master", "select name from foods where source = 'crea' and source_ref = '000020'"))[0].name).toBe("Farro perlato, crudo");
  });

  it("un prodotto manuale è subito utilizzabile e resta da verificare", async () => {
    const id = await addFood("athlete", piadina, piadinaVals);
    const [f] = await rows("coach", "select * from search_foods('piadina marca')");
    expect(f).toMatchObject({ id, kind: "branded", brand: "Marca Prova", status: "to_verify", source: "manual" });
    expect(Number(f.fat_g)).toBe(8.5);
  });

  it("con etichetta leggibile l'approvazione è automatica, con una cifra illeggibile no", async () => {
    const ok = await addFood("athlete", { name: "Miele millefiori", brand: "Apicoltura Prova" },
      { kcal: 304, carbs_g: 80, provenance: "label", label_photo_path: await upload("athlete", "miele.jpg") });
    const dubbio = await addFood("athlete", { name: "Marmellata albicocche", brand: "Prova" },
      { kcal: 150, carbs_g: 36, provenance: "label", label_photo_path: await upload("athlete", "marm.jpg"), unreadable: ["fat_g"] });
    const st = Object.fromEntries((await rows("master", `select id, status from foods where id in ('${ok}', '${dubbio}')`)).map(r => [r.id, r.status]));
    expect(st[ok]).toBe("auto_approved");
    expect(st[dubbio]).toBe("to_verify");
    await expect(addFood("athlete", { name: "Senza foto" }, { kcal: 1, provenance: "label" })).rejects.toThrow(/label_photo_required/);
  });

  it("le foto delle etichette: ognuno carica nella sua cartella e non usa le foto altrui", async () => {
    await expect(rows("athlete", "insert into storage.objects (bucket_id, name) values ('food-labels', $1)",
      [`${ids.coach}/finta.jpg`])).rejects.toThrow();
    const altrui = await upload("coach", "biscotti.jpg");
    await expect(addFood("athlete", { name: "Biscotti", brand: "Prova" },
      { kcal: 450, provenance: "label", label_photo_path: altrui })).rejects.toThrow(/label_photo_not_found/);
    await expect(addFood("athlete", { name: "Biscotti", brand: "Prova" },
      { kcal: 450, provenance: "label", label_photo_path: `${ids.athlete}/mai-caricata.jpg` })).rejects.toThrow(/label_photo_not_found/);
    // Tutti gli utenti collegati vedono le foto, nessuno le cancella.
    expect(await rows("athlete", "select name from storage.objects where name = $1", [altrui])).toHaveLength(1);
    await expect(rows("coach", "delete from storage.objects where name = $1 returning name", [altrui])).resolves.toEqual([]);
    await db.exec("set role anon;");
    await expect(db.query("select * from storage.objects where bucket_id = 'food-labels'")).rejects.toThrow();
    await db.exec("reset role;");
  });

  it("la ricerca ignora accenti e maiuscole e trova i sinonimi", async () => {
    await as("master", () => db.query(`insert into foods (kind, name, aliases, source, status)
      values ('generic', 'Tisana zenzero', array['infuso allo zenzero'], 'institutional', 'verified')`));
    expect(await rows("athlete", "select name from search_foods('TISANA')")).toHaveLength(1);
    expect(await rows("athlete", "select name from search_foods('infuso zenzero')")).toHaveLength(1);
    expect((await rows("athlete", "select name from search_foods('CAFFE TOSTATO')"))[0].name).toBe("Caffè tostato");
    expect(await rows("athlete", "select name from search_foods('   ')")).toHaveLength(0);
  });
});

describe("catalogo: verifica, duplicati, versioni", () => {
  it("solo il master verifica", async () => {
    const [{ id }] = await rows("master", "select id from foods where name = 'Piadina'");
    await expect(rows("coach", "select verify_food($1)", [id])).rejects.toThrow(/forbidden/);
    await rows("master", "select verify_food($1)", [id]);
    expect((await rows("athlete", "select status from foods where id = $1", [id]))[0].status).toBe("verified");
  });

  it("una nuova etichetta vale per i pasti successivi, i vecchi valori restano", async () => {
    const [{ id, current_version_id: v1 }] = await rows("master", "select id, current_version_id from foods where name = 'Piadina'");
    // Voce verificata: chi l'ha creata non la modifica più, il master sì.
    await expect(rows("athlete", "select add_food_version($1, $2)", [id, JSON.stringify({ ...piadinaVals, fat_g: 9 })])).rejects.toThrow(/forbidden/);
    const [{ add_food_version: v2 }] = await rows("master", "select add_food_version($1, $2)",
      [id, JSON.stringify({ ...piadinaVals, fat_g: 9.2, provenance: "label", label_photo_path: await upload("master", "p2.jpg") })]);
    expect(v2).not.toBe(v1);
    const versions = await rows("athlete", "select id, version, fat_g from food_versions where food_id = $1 order by version", [id]);
    expect(versions.map(v => [v.version, Number(v.fat_g)])).toEqual([[1, 8.5], [2, 9.2]]);
    expect((await rows("athlete", "select current_version_id from foods where id = $1", [id]))[0].current_version_id).toBe(v2);
    // Nessuno modifica o cancella una versione già usata.
    await expect(rows("master", "update food_versions set fat_g = 0 where food_id = $1", [id])).rejects.toThrow();
    await expect(rows("master", "delete from food_versions where food_id = $1", [id])).rejects.toThrow();
    await expect(rows("master", "delete from foods where id = $1", [id])).rejects.toThrow();
  });

  it("chi ha creato una voce non verificata può aggiornarla, un altro utente no", async () => {
    const id = await addFood("athlete", { name: "Taralli", brand: "Forno Prova" }, { kcal: 450, provenance: "manual" });
    await rows("athlete", "select add_food_version($1, $2)", [id, JSON.stringify({ kcal: 460, fat_g: 18, provenance: "manual" })]);
    await expect(rows("coach", "select add_food_version($1, $2)", [id, JSON.stringify({ kcal: 1, provenance: "manual" })])).rejects.toThrow(/forbidden/);
    await expect(rows("athlete", "select add_food_version($1, $2)", [id, JSON.stringify({ kcal: 1, provenance: "import" })])).rejects.toThrow(/invalid_provenance/);
    await expect(rows("athlete", "select add_food_version($1, $2)", [id, JSON.stringify({ kcal: 1, provenance: "label" })])).rejects.toThrow(/label_photo_required/);
  });

  it("il master riconduce un duplicato alla voce principale", async () => {
    const dup = await addFood("coach", { name: "Piadina classica", brand: "Marca Prova" }, piadinaVals);
    const [{ id: target }] = await rows("master", "select id from foods where name = 'Piadina'");
    await expect(rows("coach", "select merge_food($1, $2)", [dup, target])).rejects.toThrow(/forbidden/);
    await rows("master", "select merge_food($1, $2)", [dup, target]);
    const found = await rows("athlete", "select id from search_foods('piadina')");
    expect(found.map(r => r.id)).toEqual([target]);
    // Il nome del duplicato diventa un sinonimo, le sue versioni restano consultabili.
    expect((await rows("athlete", "select aliases from foods where id = $1", [target]))[0].aliases).toContain("Piadina classica");
    expect(await rows("athlete", "select id from food_versions where food_id = $1", [dup])).toHaveLength(1);
  });

  it("le funzioni interne non sono richiamabili dal browser", async () => {
    const [{ id }] = await rows("master", "select id from foods where name = 'Taralli'");
    await expect(rows("athlete", "select insert_food_version($1, 9, '{}'::jsonb, 'import', '{}')", [id])).rejects.toThrow();
  });
});
