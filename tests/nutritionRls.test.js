// Piani alimentari: chi scrive, chi legge, attivazione e PDF originali nel bucket privato.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ids = {
  athlete: "00000000-0000-0000-0000-0000000000a1",
  coach: "00000000-0000-0000-0000-0000000000c1",
  nutri: "00000000-0000-0000-0000-0000000000e1",
  other: "00000000-0000-0000-0000-0000000000f1",
  master: "00000000-0000-0000-0000-0000000000ff",
};
let db;
const as = async (key, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ids[key]}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const rows = async (key, sql, params) => as(key, async () => (await db.query(sql, params)).rows);
const content = JSON.stringify({ schema: 1, dayTypes: [] });
const newPlan = (key, version, by = key) => rows(key, `insert into nutrition_plans (athlete_id, created_by, version, content, week_pattern)
  values ($1, $2, $3, $4, '{A,A,B,A,B,A,B}') returning id, status`, [ids.athlete, ids[by], version, content]);

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
  await db.exec(`update profiles set role = 'professional' where id in ('${ids.coach}', '${ids.nutri}', '${ids.other}');
    update profiles set is_master = true where id = '${ids.master}';
    insert into care_links (athlete_id, professional_id, modules) values
      ('${ids.athlete}', '${ids.coach}', array['training','checkin']),
      ('${ids.athlete}', '${ids.nutri}', array['nutrition','checkin']);`);
});

describe("piani alimentari", () => {
  it("il nutrizionista crea una bozza, il coach senza modulo alimentazione no", async () => {
    const [plan] = await newPlan("nutri", 1);
    expect(plan.status).toBe("draft");
    await expect(newPlan("coach", 2)).rejects.toThrow();
    await expect(newPlan("other", 2)).rejects.toThrow();
    await expect(newPlan("athlete", 2)).rejects.toThrow();
  });

  it("non si crea una bozza a nome di un altro né una seconda versione uguale", async () => {
    await expect(newPlan("nutri", 5, "coach")).rejects.toThrow();
    await expect(newPlan("nutri", 1)).rejects.toThrow();
  });

  it("l'atleta non vede le bozze; coach senza modulo e altri studi non vedono nulla", async () => {
    expect(await rows("athlete", "select id from nutrition_plans")).toHaveLength(0);
    expect(await rows("coach", "select id from nutrition_plans")).toHaveLength(0);
    expect(await rows("other", "select id from nutrition_plans")).toHaveLength(0);
    expect(await rows("master", "select id from nutrition_plans")).toHaveLength(1);
  });

  it("solo il nutrizionista attiva; l'attivazione archivia il piano precedente", async () => {
    const [v1] = await rows("nutri", "select id from nutrition_plans where version = 1");
    await expect(as("master", () => db.query("select activate_nutrition_plan($1)", [v1.id]))).rejects.toThrow(/not_allowed/);
    await expect(as("athlete", () => db.query("select activate_nutrition_plan($1)", [v1.id]))).rejects.toThrow(/not_allowed/);
    await as("nutri", () => db.query("select activate_nutrition_plan($1)", [v1.id]));
    const [v2] = await newPlan("nutri", 2);
    await as("nutri", () => db.query("select activate_nutrition_plan($1)", [v2.id]));
    const all = await rows("athlete", "select version, status from nutrition_plans order by version");
    expect(all).toEqual([{ version: 1, status: "archived" }, { version: 2, status: "active" }]);
  });

  it("un piano attivo non si modifica né si cancella dal browser, e lo stato non si cambia a mano", async () => {
    await rows("nutri", "update nutrition_plans set title = 'Modificato' where version = 2");
    expect((await rows("nutri", "select title from nutrition_plans where version = 2"))[0].title).toBe("Piano alimentare");
    await rows("nutri", "delete from nutrition_plans where version = 2");
    expect(await rows("nutri", "select id from nutrition_plans")).toHaveLength(2);
    const [v3] = await newPlan("nutri", 3);
    await expect(rows("nutri", "update nutrition_plans set status = 'active' where id = $1", [v3.id])).rejects.toThrow();
  });

  it("anon non ha accesso", async () => {
    await db.exec("set role anon;");
    try { await expect(db.query("select * from nutrition_plans")).rejects.toThrow(); } finally { await db.exec("reset role;"); }
  });
});

describe("PDF originali", () => {
  const put = (key, name) => rows(key, "insert into storage.objects (bucket_id, name) values ('nutrition-pdfs', $1) returning name", [name]);

  it("il nutrizionista carica nella cartella dell'atleta, gli altri no", async () => {
    await put("nutri", `${ids.athlete}/piano.pdf`);
    await expect(put("coach", `${ids.athlete}/altro.pdf`)).rejects.toThrow();
    await expect(put("athlete", `${ids.athlete}/mio.pdf`)).rejects.toThrow();
    await expect(put("nutri", "percorso-non-valido.pdf")).rejects.toThrow();
  });

  it("l'atleta legge il proprio PDF, un professionista di un altro studio no", async () => {
    expect(await rows("athlete", "select name from storage.objects")).toHaveLength(1);
    expect(await rows("other", "select name from storage.objects")).toHaveLength(0);
    expect(await rows("coach", "select name from storage.objects")).toHaveLength(0);
  });
});
