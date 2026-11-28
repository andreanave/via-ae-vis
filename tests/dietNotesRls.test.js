// Intolleranze e allergie: chi le vede e chi le scrive.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ids = {
  athlete: "00000000-0000-0000-0000-0000000000a1",
  athlete2: "00000000-0000-0000-0000-0000000000a2",
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
const save = (key, by = key, allergens = "{latte}") => rows(key, `insert into athlete_diet_notes (athlete_id, lactose_intolerant, allergens, updated_by)
  values ($1, true, $2, $3) returning athlete_id`, [ids.athlete, allergens, ids[by]]);

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
      ('${ids.athlete}', '${ids.nutri}', array['nutrition']);`);
});

describe("intolleranze e allergie dell'atleta", () => {
  it("le scrive solo il professionista con il modulo alimentazione, a proprio nome", async () => {
    await expect(save("athlete")).rejects.toThrow();
    await expect(save("coach")).rejects.toThrow();
    await expect(save("other")).rejects.toThrow();
    await expect(save("master")).rejects.toThrow();
    await expect(save("nutri", "coach")).rejects.toThrow();
    expect(await save("nutri")).toHaveLength(1);
  });

  it("accetta solo i 14 allergeni UE", async () => {
    await expect(rows("nutri", "update athlete_diet_notes set allergens = '{pomodoro}' where athlete_id = $1", [ids.athlete])).rejects.toThrow();
  });

  it("le vedono l'atleta, il nutrizionista e il master; non il coach senza modulo né altri", async () => {
    expect(await rows("athlete", "select athlete_id from athlete_diet_notes")).toHaveLength(1);
    expect(await rows("nutri", "select athlete_id from athlete_diet_notes")).toHaveLength(1);
    expect(await rows("master", "select athlete_id from athlete_diet_notes")).toHaveLength(1);
    expect(await rows("coach", "select athlete_id from athlete_diet_notes")).toHaveLength(0);
    expect(await rows("other", "select athlete_id from athlete_diet_notes")).toHaveLength(0);
    expect(await rows("athlete2", "select athlete_id from athlete_diet_notes")).toHaveLength(0);
  });

  it("l'atleta e il master non le modificano", async () => {
    await rows("athlete", "update athlete_diet_notes set lactose_intolerant = false");
    await rows("master", "update athlete_diet_notes set lactose_intolerant = false");
    expect((await rows("nutri", "select lactose_intolerant from athlete_diet_notes"))[0].lactose_intolerant).toBe(true);
    await rows("nutri", "update athlete_diet_notes set lactose_intolerant = false, updated_by = $1", [ids.nutri]);
    expect((await rows("nutri", "select lactose_intolerant from athlete_diet_notes"))[0].lactose_intolerant).toBe(false);
  });

  it("nessuno le cancella dal browser", async () => {
    await expect(rows("nutri", "delete from athlete_diet_notes")).rejects.toThrow();
  });
});
