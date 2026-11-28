// Le funzioni di servizio non sono esposte ad anon e non rivelano a chi appartengono schede e sedute altrui.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ids = { athlete: "00000000-0000-0000-0000-00000000000a", coach: "00000000-0000-0000-0000-00000000000c", other: "00000000-0000-0000-0000-00000000000f" };
let db, program;
const as = async (key, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ids[key]}', false);
    select set_config('request.jwt.claim.email', '${key}@test.local', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const rows = (key, sql, params) => as(key, async () => (await db.query(sql, params)).rows);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("tests/supabaseStub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  for (const [key, id] of Object.entries(ids)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${key}@test.local`]);
  await db.exec(`update profiles set role = 'professional' where id in ('${ids.coach}', '${ids.other}');
    insert into care_links (athlete_id, professional_id, modules) values ('${ids.athlete}', '${ids.coach}', array['training']);`);
  [{ id: program }] = await rows("coach", `insert into programs (athlete_id, professional_id) values ('${ids.athlete}', '${ids.coach}') returning id`);
});

describe("funzioni di servizio", () => {
  it("anon non può chiamarle", async () => {
    await db.exec("set role anon;");
    await expect(db.query("select public.is_master()")).rejects.toThrow(/permission denied/);
    await db.exec("reset role;");
  });

  it("un estraneo non scopre di chi è una scheda, il coach sì", async () => {
    expect((await rows("other", "select program_athlete($1) as a", [program]))[0].a).toBeNull();
    expect((await rows("coach", "select program_athlete($1) as a", [program]))[0].a).toBe(ids.athlete);
  });

  it("il coach continua a scrivere le sedute della scheda", async () => {
    const r = await rows("coach", `insert into program_sessions (program_id, position, name) values ('${program}', 0, 'A') returning id`);
    expect(r).toHaveLength(1);
  });
});
