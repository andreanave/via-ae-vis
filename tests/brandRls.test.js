// Marchio per studio: chi lo vede e chi lo modifica.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ids = {
  athlete: "00000000-0000-0000-0000-00000000000a",
  coach: "00000000-0000-0000-0000-00000000000c",
  nutri: "00000000-0000-0000-0000-00000000000e",
  other: "00000000-0000-0000-0000-00000000000f",
  master: "00000000-0000-0000-0000-0000000000ff",
};
const email = key => `${key}@test.local`;
let db, studio;
const as = async (key, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ids[key]}', false);
    select set_config('request.jwt.claim.email', '${email(key)}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const rows = async (key, sql, params) => as(key, async () => (await db.query(sql, params)).rows);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("tests/supabaseStub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  for (const [key, id] of Object.entries(ids)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email(key), JSON.stringify({ full_name: key })]);
  }
  await db.exec(`update profiles set role = 'professional' where id in ('${ids.coach}', '${ids.nutri}', '${ids.other}');
    update profiles set is_master = true where id = '${ids.master}';
    insert into care_links (athlete_id, professional_id, modules, started_at) values
      ('${ids.athlete}', '${ids.nutri}', array['nutrition'], now() - interval '1 year'),
      ('${ids.athlete}', '${ids.coach}', array['training','checkin'], now());`);
  [{ id: studio }] = await rows("master", `insert into studios (name, created_by) values ('Ruggero Fattore Studio', '${ids.master}') returning id`);
  await rows("master", `insert into studio_members (studio_id, profile_id, role) values ('${studio}', '${ids.coach}', 'owner')`);
});

describe("marchio per studio", () => {
  it("il titolare imposta il marchio, un altro professionista no", async () => {
    await rows("coach", `update studios set brand_name = 'Vis æ Vis', accent = '#1C3D32' where id = '${studio}'`);
    await rows("other", `update studios set brand_name = 'Altro' where id = '${studio}'`);
    expect((await rows("master", `select brand_name from studios where id = '${studio}'`))[0].brand_name).toBe("Vis æ Vis");
  });

  it("solo il master gestisce i membri", async () => {
    await expect(rows("coach", `insert into studio_members (studio_id, profile_id) values ('${studio}', '${ids.other}')`)).rejects.toThrow();
  });

  it("coach e atleta vedono il marchio dello studio; l'atleta usa quello del coach di allenamento", async () => {
    expect((await rows("coach", "select * from brand_for()"))[0]).toMatchObject({ brand_name: "Vis æ Vis", accent: "#1C3D32" });
    expect((await rows("athlete", "select brand_name from brand_for()"))[0].brand_name).toBe("Vis æ Vis");
  });

  it("chi non ha studio vede il marchio della piattaforma; solo il master guarda il marchio di un altro", async () => {
    expect(await rows("nutri", "select * from brand_for()")).toHaveLength(0);
    expect(await rows("other", "select * from brand_for($1)", [ids.athlete])).toHaveLength(0);
    expect((await rows("master", "select brand_name from brand_for($1)", [ids.athlete]))[0].brand_name).toBe("Vis æ Vis");
  });

  it("la pagina d'invito mostra il marchio di chi invita, anche senza account", async () => {
    const [inv] = await rows("coach", `insert into invites (email, invited_by) values ('nuovo@test.local', '${ids.coach}') returning token`);
    await db.exec("set role anon;");
    const res = (await db.query("select brand_name from invite_brand($1)", [inv.token])).rows;
    await db.exec("reset role;");
    expect(res).toEqual([{ brand_name: "Vis æ Vis" }]);
  });
});
