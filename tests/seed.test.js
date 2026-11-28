// Il seed dei dati di prova gira sul database con le migrazioni e si può rieseguire senza doppioni.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

let db;
const count = async sql => Number((await db.query(sql)).rows[0].n);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("tests/supabaseStub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  // Colonne e funzioni di Supabase Auth usate dal seed, ridotte al minimo.
  await db.exec(`
    alter table auth.users add column instance_id uuid, add column aud text, add column role text,
      add column encrypted_password text, add column email_confirmed_at timestamptz, add column raw_app_meta_data jsonb,
      add column created_at timestamptz, add column updated_at timestamptz, add column confirmation_token text,
      add column recovery_token text, add column email_change_token_new text, add column email_change text,
      add column email_change_token_current text, add column phone_change text, add column phone_change_token text,
      add column reauthentication_token text;
    create table auth.identities (provider_id text, user_id uuid, identity_data jsonb, provider text,
      last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create function gen_salt(text) returns text language sql as $$ select 'salt' $$;
    create function crypt(text, text) returns text language sql as $$ select md5($1 || $2) $$;
    insert into auth.users (id, email, raw_user_meta_data) values
      ('00000000-0000-0000-0000-0000000000c1', 'rugge@test.it', '{"full_name":"Rugge (test)"}'),
      ('00000000-0000-0000-0000-0000000000a1', 'atleta@test.it', '{"full_name":"Nave Test"}');
    update profiles set role = 'professional' where id = '00000000-0000-0000-0000-0000000000c1';
    insert into studios (id, name, created_by) values ('00000000-0000-0000-0000-0000000000d1', 'Vis ae Vis', '00000000-0000-0000-0000-0000000000c1');
    insert into studio_members values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'owner'),
      ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'member');
    insert into care_links (athlete_id, professional_id, studio_id, modules) values
      ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', array['training','nutrition','checkin']);
    insert into programs (id, athlete_id, professional_id, name, status) values
      ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Scheda di prova', 'active');
    insert into program_sessions (id, program_id, position, name) values
      ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 0, 'A · Spinta'),
      ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 1, 'B · Tirata');
    insert into session_exercises (session_id, position, name, sets, reps, load) values
      ('00000000-0000-0000-0000-0000000000e1', 0, 'Panca piana con bilanciere', 4, '6-8', '70 kg'),
      ('00000000-0000-0000-0000-0000000000e1', 1, 'Croci ai cavi', 3, '12-15', ''),
      ('00000000-0000-0000-0000-0000000000e2', 0, 'Trazioni alla sbarra', 4, '6-8', '');
    update session_exercises set bodyweight = true where name = 'Trazioni alla sbarra';
  `);
});

const totals = async () => ({
  athletes: await count("select count(*) n from care_links"),
  daily: await count("select count(*) n from daily_entries"),
  weekly: await count("select count(*) n from weekly_checkins where status = 'confirmed'"),
  workouts: await count("select count(*) n from workout_logs"),
  sets: await count("select count(*) n from set_logs"),
  messages: await count("select count(*) n from messages"),
  notifications: await count("select count(*) n from notifications"),
  tasks: await count("select count(*) n from coach_tasks"),
  meals: await count("select count(*) n from meal_logs where kind = 'meal'"),
  mealNotes: await count("select count(*) n from meal_logs where note <> ''"),
  supplements: await count("select count(*) n from meal_logs where kind = 'supplement'"),
});

describe("seed dei dati di prova", () => {
  it("crea atleti, check-in, sedute, chat e agenda", async () => {
    await db.exec(readFileSync("supabase/seed/demo.sql", "utf8"));
    const t = await totals();
    expect(t.athletes).toBe(5);
    expect(t.daily).toBeGreaterThan(5 * 30);
    expect(t.weekly).toBeGreaterThanOrEqual(19);
    expect(t.workouts).toBeGreaterThan(30);
    expect(t.sets).toBeGreaterThan(100);
    expect(t.messages).toBe(16);
    expect(t.notifications).toBe(4);
    expect(t.tasks).toBe(5);
    // Diario dei pasti dai piani di prova: 6 giorni, qualche nota, integratori.
    expect(t.meals).toBeGreaterThan(40);
    expect(t.mealNotes).toBeGreaterThan(0);
    expect(t.supplements).toBeGreaterThan(5);
    const [snap] = (await db.query(`select snapshot from weekly_checkins w join auth.users u on u.id = w.athlete_id
      where u.email = 'atleta@test.it' order by week_end desc limit 1`)).rows;
    expect(snap.snapshot.weight.count).toBeGreaterThan(0);
    expect(snap.snapshot.workouts_done.origin).toBe("override");
    // I trigger delle notifiche tornano attivi.
    const triggers = await count(`select count(*) n from pg_trigger where tgname in ('weekly_notify','messages_notify','checkin_comment_notify','meal_note_notify') and tgenabled = 'O'`);
    expect(triggers).toBe(4);
  });

  it("rieseguito non crea doppioni", async () => {
    const before = await totals();
    await db.exec(readFileSync("supabase/seed/demo.sql", "utf8"));
    const after = await totals();
    expect(after.athletes).toBe(before.athletes);
    expect(after.weekly).toBe(before.weekly);
    expect(after.workouts).toBe(before.workouts);
    expect(after.sets).toBe(before.sets);
    expect(after.messages).toBe(before.messages);
    expect(after.notifications).toBe(before.notifications);
    expect(after.tasks).toBe(before.tasks);
    expect(after.meals).toBe(before.meals);
    expect(after.supplements).toBe(before.supplements);
  });
});
