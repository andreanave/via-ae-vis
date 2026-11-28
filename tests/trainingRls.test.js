// Fase 3: chi scrive e chi legge schede, calendario e sedute registrate.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ids = {
  athlete: "00000000-0000-0000-0000-00000000000a",
  coach: "00000000-0000-0000-0000-00000000000c",
  nutri: "00000000-0000-0000-0000-00000000000e",
  other: "00000000-0000-0000-0000-00000000000f",
};
const email = key => `${key}@test.local`;
let db;
const as = async (key, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ids[key]}', false);
    select set_config('request.jwt.claim.email', '${email(key)}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const rows = async (key, sql, params) => as(key, async () => (await db.query(sql, params)).rows);
const uuid = n => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("tests/supabaseStub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  for (const [key, id] of Object.entries(ids)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email(key), JSON.stringify({ full_name: key })]);
  }
  await db.exec(`update profiles set role = 'professional' where id in ('${ids.coach}', '${ids.nutri}', '${ids.other}');
    insert into care_links (athlete_id, professional_id, modules) values
      ('${ids.athlete}', '${ids.coach}', array['training','checkin']),
      ('${ids.athlete}', '${ids.nutri}', array['nutrition','checkin']);`);
});

let programId, sessionId, exerciseRowId;

describe("schede", () => {
  it("il coach con modulo allenamento crea una scheda con sedute ed esercizi", async () => {
    const [ex] = await rows("coach", `insert into exercises (owner_id, name) values ('${ids.coach}', 'Squat') returning id`);
    const [p] = await rows("coach", `insert into programs (athlete_id, professional_id, name) values ('${ids.athlete}', '${ids.coach}', 'Blocco 1') returning id`);
    programId = p.id;
    const [s] = await rows("coach", `insert into program_sessions (program_id, position, name) values ('${programId}', 0, 'A') returning id`);
    sessionId = s.id;
    const [se] = await rows("coach", `insert into session_exercises (session_id, position, exercise_id, name, sets, reps)
      values ('${sessionId}', 0, '${ex.id}', 'Squat', 3, '7-11') returning id`);
    exerciseRowId = se.id;
    expect(exerciseRowId).toBeTruthy();
  });

  it("l'atleta non vede la bozza, la vede dopo l'attivazione insieme a sedute ed esercizi", async () => {
    expect(await rows("athlete", "select id from programs")).toHaveLength(0);
    await rows("coach", "select activate_program($1)", [programId]);
    expect(await rows("athlete", "select id from programs")).toHaveLength(1);
    expect(await rows("athlete", "select id from session_exercises")).toHaveLength(1);
    expect(await rows("athlete", "select name from exercises")).toEqual([{ name: "Squat" }]);
  });

  it("attivare una nuova scheda archivia la precedente", async () => {
    const [p2] = await rows("coach", `insert into programs (athlete_id, professional_id, name) values ('${ids.athlete}', '${ids.coach}', 'Blocco 2') returning id`);
    await rows("coach", "select activate_program($1)", [p2.id]);
    const all = await rows("coach", "select name, status from programs order by name");
    expect(all).toEqual([{ name: "Blocco 1", status: "archived" }, { name: "Blocco 2", status: "active" }]);
    await rows("coach", "select activate_program($1)", [programId]);
  });

  it("il nutrizionista e un coach esterno non scrivono né leggono la scheda", async () => {
    await expect(rows("nutri", `insert into programs (athlete_id, professional_id) values ('${ids.athlete}', '${ids.nutri}')`)).rejects.toThrow();
    expect(await rows("nutri", "select id from programs")).toHaveLength(0);
    expect(await rows("other", "select id from program_sessions")).toHaveLength(0);
    await expect(rows("other", "select activate_program($1)", [programId])).rejects.toThrow(/forbidden/);
  });

  it("l'atleta non modifica la scheda", async () => {
    await rows("athlete", `update session_exercises set sets = 10 where id = '${exerciseRowId}'`);
    expect((await rows("coach", `select sets from session_exercises where id = '${exerciseRowId}'`))[0].sets).toBe(3);
  });
});

describe("sedute registrate", () => {
  const workout = uuid(1);
  const upsertWorkout = status => rows("athlete", `insert into workout_logs (id, athlete_id, program_id, session_id, session_name, performed_on, status)
    values ($1, $2, $3, $4, 'A', '2026-11-30', $5)
    on conflict (id) do update set status = excluded.status, client_updated_at = now()`, [workout, ids.athlete, programId, sessionId, status]);
  const upsertSet = (load, reps) => rows("athlete", `insert into set_logs (id, workout_id, session_exercise_id, exercise_name, set_index, load, reps)
    values ($1, $2, $3, 'Squat', 0, $4, $5)
    on conflict (id) do update set load = excluded.load, reps = excluded.reps`, [uuid(2), workout, exerciseRowId, load, reps]);

  it("reinviare gli stessi dati dal telefono non crea duplicati", async () => {
    await upsertWorkout("in_progress");
    await upsertSet(80, 8);
    await upsertWorkout("done");
    await upsertSet(82.5, 8);
    expect(await rows("athlete", "select status from workout_logs")).toEqual([{ status: "done" }]);
    expect(await rows("athlete", "select load::float, reps from set_logs")).toEqual([{ load: 82.5, reps: 8 }]);
  });

  it("il coach legge le sedute, il nutrizionista e il coach esterno no", async () => {
    expect(await rows("coach", "select id from set_logs")).toHaveLength(1);
    expect(await rows("nutri", "select id from workout_logs")).toHaveLength(0);
    expect(await rows("other", "select id from set_logs")).toHaveLength(0);
  });

  it("nessuno registra sedute a nome dell'atleta", async () => {
    await expect(rows("coach", `insert into workout_logs (id, athlete_id, performed_on) values ('${uuid(9)}', '${ids.athlete}', '2026-11-30')`)).rejects.toThrow();
    await expect(rows("coach", `insert into set_logs (id, workout_id, set_index) values ('${uuid(8)}', '${workout}', 1)`)).rejects.toThrow();
  });

  it("l'atleta sposta un allenamento; coach e nutrizionista vedono il calendario", async () => {
    await rows("athlete", `insert into schedule_overrides (athlete_id, day, kind) values ('${ids.athlete}', '2026-12-01', 'training')`);
    expect(await rows("coach", "select kind from schedule_overrides")).toHaveLength(1);
    expect(await rows("nutri", "select kind from schedule_overrides")).toHaveLength(1);
    expect(await rows("other", "select kind from schedule_overrides")).toHaveLength(0);
  });
});
