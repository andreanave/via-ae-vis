// Fase 6: chat e notifiche.
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
let db, coachLink, nutriLink;
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
    update profiles set is_master = true where id = '${ids.master}';`);
  [{ id: coachLink }] = (await db.query(`insert into care_links (athlete_id, professional_id, modules) values ('${ids.athlete}', '${ids.coach}', array['training','checkin']) returning id`)).rows;
  [{ id: nutriLink }] = (await db.query(`insert into care_links (athlete_id, professional_id, modules) values ('${ids.athlete}', '${ids.nutri}', array['nutrition']) returning id`)).rows;
});

describe("chat", () => {
  it("atleta e coach si scrivono; il messaggio genera una notifica per chi lo riceve", async () => {
    await rows("athlete", `insert into messages (care_link_id, sender_id, body) values ('${coachLink}', '${ids.athlete}', 'Ciao coach')`);
    await rows("coach", `insert into messages (care_link_id, sender_id, body) values ('${coachLink}', '${ids.coach}', 'Ciao!')`);
    expect(await rows("athlete", `select body from messages where care_link_id = '${coachLink}' order by created_at`)).toHaveLength(2);
    expect((await rows("coach", "select title, link from notifications"))[0]).toMatchObject({ title: "athlete", link: `/messaggi/${coachLink}` });
  });

  it("il nutrizionista e un estraneo non leggono la chat con il coach, il master sì", async () => {
    expect(await rows("nutri", `select id from messages where care_link_id = '${coachLink}'`)).toHaveLength(0);
    expect(await rows("other", "select id from messages")).toHaveLength(0);
    expect(await rows("master", "select id from messages")).toHaveLength(2);
  });

  it("nessuno scrive a nome di un altro o in una chat non sua", async () => {
    await expect(rows("other", `insert into messages (care_link_id, sender_id, body) values ('${coachLink}', '${ids.other}', 'x')`)).rejects.toThrow();
    await expect(rows("coach", `insert into messages (care_link_id, sender_id, body) values ('${coachLink}', '${ids.athlete}', 'x')`)).rejects.toThrow();
    await expect(rows("master", `insert into messages (care_link_id, sender_id, body) values ('${coachLink}', '${ids.master}', 'x')`)).rejects.toThrow();
  });

  it("solo il destinatario segna come letto e non può cambiare il testo", async () => {
    await rows("athlete", `update messages set read_at = now() where sender_id = '${ids.coach}'`);
    await rows("athlete", `update messages set read_at = now() where sender_id = '${ids.athlete}'`);
    const r = await rows("coach", "select sender_id, read_at from messages order by created_at");
    expect(r[0].read_at).toBeNull();
    expect(r[1].read_at).not.toBeNull();
    await expect(rows("athlete", `update messages set body = 'x'`)).rejects.toThrow();
  });

  it("messaggi ripetuti non accumulano notifiche non lette", async () => {
    await rows("athlete", `insert into messages (care_link_id, sender_id, body) values ('${coachLink}', '${ids.athlete}', 'Secondo')`);
    const n = await rows("coach", "select body from notifications where read_at is null");
    expect(n).toEqual([{ body: "Secondo" }]);
  });
});

describe("notifiche", () => {
  it("il check-in settimanale confermato avvisa solo i professionisti con il check-in", async () => {
    await rows("athlete", `insert into weekly_checkins (athlete_id, week_end, status) values ('${ids.athlete}', '2026-11-29', 'confirmed')`);
    expect(await rows("coach", "select id from notifications where kind = 'weekly_confirmed'")).toHaveLength(1);
    expect(await rows("nutri", "select id from notifications")).toHaveLength(0);
  });

  it("la domanda del coach sul check-in arriva all'atleta", async () => {
    const [w] = await rows("athlete", "select id from weekly_checkins");
    await rows("coach", `insert into checkin_comments (weekly_checkin_id, author_id, kind, body) values ('${w.id}', '${ids.coach}', 'question', 'Come hai dormito?')`);
    expect((await rows("athlete", "select title from notifications where kind = 'checkin_comment'"))[0].title).toMatch(/domanda/);
  });

  it("l'attivazione di una scheda avvisa l'atleta", async () => {
    const [p] = await rows("coach", `insert into programs (athlete_id, professional_id, name) values ('${ids.athlete}', '${ids.coach}', 'Blocco 1') returning id`);
    await rows("coach", "select activate_program($1)", [p.id]);
    expect(await rows("athlete", "select body from notifications where kind = 'program_active'")).toEqual([{ body: "Blocco 1" }]);
  });

  it("le notifiche non si creano dal browser e restano private", async () => {
    await expect(rows("athlete", `insert into notifications (recipient_id, kind, title) values ('${ids.coach}', 'message', 'finta')`)).rejects.toThrow();
    await expect(rows("athlete", `select notify('${ids.coach}', 'message', 'x', 'y', '/')`)).rejects.toThrow();
    expect(await rows("other", "select id from notifications")).toHaveLength(0);
  });
});
