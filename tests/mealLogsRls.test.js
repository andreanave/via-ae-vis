// Diario dei pasti, orari della giornata e "Da rispondere": chi scrive e chi legge.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ids = {
  athlete: "00000000-0000-0000-0000-0000000000a1",
  coach: "00000000-0000-0000-0000-0000000000c1", // solo allenamento
  nutri: "00000000-0000-0000-0000-0000000000e1", // alimentazione
  other: "00000000-0000-0000-0000-0000000000f1",
  athlete2: "00000000-0000-0000-0000-0000000000a2",
  master: "00000000-0000-0000-0000-0000000000ff",
};
let db;
const as = async (key, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ids[key]}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const rows = async (key, sql, params) => as(key, async () => (await db.query(sql, params)).rows);
const log = (key, athlete = key, note = "") => rows(key, `insert into meal_logs (athlete_id, day, item_key, item_name, note)
  values ($1, current_date, 'pranzo', 'Pranzo', $2) returning id`, [ids[athlete], note]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("tests/supabaseStub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
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

describe("diario dei pasti", () => {
  it("l'atleta registra il proprio pasto, non quello di altri; i professionisti non scrivono", async () => {
    expect(await log("athlete")).toHaveLength(1);
    await expect(log("athlete2", "athlete")).rejects.toThrow();
    await expect(log("nutri", "athlete")).rejects.toThrow();
    await expect(log("coach", "athlete")).rejects.toThrow();
  });

  it("legge chi segue l'alimentazione e il master; il coach senza modulo e gli altri no", async () => {
    expect(await rows("nutri", "select id from meal_logs")).toHaveLength(1);
    expect(await rows("master", "select id from meal_logs")).toHaveLength(1);
    expect(await rows("coach", "select id from meal_logs")).toHaveLength(0);
    expect(await rows("other", "select id from meal_logs")).toHaveLength(0);
    expect(await rows("athlete2", "select id from meal_logs")).toHaveLength(0);
  });

  it("una nota sul pasto avvisa chi segue l'alimentazione", async () => {
    await rows("athlete", "update meal_logs set note = 'Ero fuori, bistecca e patate' where item_key = 'pranzo'");
    const n = await rows("nutri", "select kind, title, body from notifications");
    expect(n).toHaveLength(1);
    expect(n[0].kind).toBe("meal_note");
    expect(n[0].body).toContain("bistecca");
    expect(await rows("coach", "select id from notifications")).toHaveLength(0);
  });

  it("il professionista non modifica il diario dell'atleta", async () => {
    await rows("nutri", "update meal_logs set note = 'cambiata'");
    const [r] = await rows("athlete", "select note from meal_logs");
    expect(r.note).toContain("bistecca");
  });
});

describe("orari e cose viste", () => {
  it("l'atleta imposta i propri orari, non quelli di altri", async () => {
    await rows("athlete", `update profiles set day_times = '{"meal:pranzo":"12:30"}' where id = $1`, [ids.athlete]);
    await rows("athlete2", `update profiles set day_times = '{"meal:pranzo":"14:00"}' where id = $1`, [ids.athlete]);
    const [p] = await rows("athlete", "select day_times from profiles where id = $1", [ids.athlete]);
    expect(p.day_times["meal:pranzo"]).toBe("12:30");
  });

  it("ogni professionista vede solo le proprie segnature", async () => {
    const [m] = await rows("athlete", "select id from meal_logs");
    await rows("nutri", "insert into coach_reviews (source, source_id) values ('meal', $1)", [m.id]);
    await expect(rows("nutri", "insert into coach_reviews (professional_id, source, source_id) values ($1, 'meal', $2)", [ids.coach, m.id])).rejects.toThrow();
    expect(await rows("nutri", "select * from coach_reviews")).toHaveLength(1);
    expect(await rows("coach", "select * from coach_reviews")).toHaveLength(0);
  });
});

describe("testo dell'andamento", () => {
  it("lo scrive chi segue l'atleta, l'atleta lo legge ma non lo cambia", async () => {
    await rows("coach", "insert into progress_notes (athlete_id, body) values ($1, 'Peso in calo regolare')", [ids.athlete]);
    await expect(rows("athlete", "insert into progress_notes (athlete_id, body) values ($1, 'x')", [ids.athlete2])).rejects.toThrow();
    await expect(rows("other", "insert into progress_notes (athlete_id, body) values ($1, 'x')", [ids.athlete2])).rejects.toThrow();
    await rows("athlete", "update progress_notes set body = 'mio'");
    const [r] = await rows("athlete", "select body from progress_notes");
    expect(r.body).toBe("Peso in calo regolare");
    expect(await rows("other", "select * from progress_notes")).toHaveLength(0);
    await rows("nutri", "update progress_notes set body = 'Bene anche a tavola', updated_by = $1", [ids.nutri]);
    const [r2] = await rows("athlete", "select body from progress_notes");
    expect(r2.body).toBe("Bene anche a tavola");
  });
});
