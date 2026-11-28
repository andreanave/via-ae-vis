// Catalogo alimentare: alimenti generici dalla tabella Ciqual (ANSES) con nomi in italiano.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const athlete = "00000000-0000-0000-0000-00000000020a";
let db;

const rows = async (sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${athlete}', false);`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); }
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("tests/supabaseStub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  }
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@test.local', '{}')", [athlete]);
});

describe("catalogo: tabella Ciqual", () => {
  it("le voci Ciqual sono caricate, verificate e con una versione", async () => {
    const [{ n, senza, nulle }] = await rows(`select count(*)::int n,
      count(*) filter (where current_version_id is null)::int senza,
      count(*) filter (where status <> 'verified' or kind <> 'generic')::int nulle
      from foods where source = 'ciqual'`);
    expect(n).toBeGreaterThan(1400);
    expect(senza).toBe(0);
    expect(nulle).toBe(0);
    // Le voci CREA restano tutte.
    expect((await rows("select count(*)::int n from foods where source = 'crea'"))[0].n).toBe(832);
  });

  it("nome italiano, stato, categoria, valori e citazione", async () => {
    const [f] = await rows(`select f.name, f.state, f.category, v.kcal, v.protein_g, v.provenance, v.note, v.extra
      from foods f join food_versions v on v.id = f.current_version_id
      where f.source = 'ciqual' and f.source_ref = '9104'`);
    expect(f).toMatchObject({ name: "Riso bianco, cotto, senza sale", state: "cooked", category: "Cereali, pasta e riso", provenance: "import" });
    expect(Number(f.kcal)).toBe(155);
    expect(f.note).toMatch(/Ciqual 2025, codice 9104/);
    expect(f.extra.nome_francese).toMatch(/^Riz blanc/);
  });

  it("tracce e valori sotto soglia diventano 0 e restano annotati", async () => {
    const [f] = await rows(`select v.fat_g, v.extra from foods f join food_versions v on v.id = f.current_version_id
      where f.source = 'ciqual' and f.source_ref = '20009'`);
    expect(Number(f.fat_g)).toBe(0);
    expect(f.extra.sotto_soglia.fat_g).toBe("<0.5");
  });

  it("la ricerca trova le voci Ciqual e a parità di nome mette prima CREA", async () => {
    expect((await rows("select source from search_foods('olio argan')"))[0].source).toBe("ciqual");
    const gorgonzola = await rows("select source from search_foods('gorgonzola')");
    expect(gorgonzola.map(r => r.source)).toEqual(expect.arrayContaining(["crea", "ciqual"]));
    expect(gorgonzola[0].source).toBe("crea");
  });

  it("un utente non può inserire voci con fonte Ciqual", async () => {
    await expect(rows(`insert into foods (kind, name, source, source_ref) values ('generic', 'X', 'ciqual', '1')`)).rejects.toThrow();
  });
});
