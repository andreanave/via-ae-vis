// I dati di prova di supabase/seed/demo.sql si caricano su uno schema vuoto e si possono ricaricare.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

let db;
const count = async sql => Number((await db.query(sql)).rows[0].n);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("tests/supabaseStub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  // Colonne e funzioni che su Supabase esistono già.
  await db.exec(`
    alter table auth.users add column if not exists instance_id uuid, add column if not exists aud text, add column if not exists role text,
      add column if not exists encrypted_password text, add column if not exists email_confirmed_at timestamptz,
      add column if not exists raw_app_meta_data jsonb, add column if not exists created_at timestamptz, add column if not exists updated_at timestamptz,
      add column if not exists confirmation_token text, add column if not exists recovery_token text,
      add column if not exists email_change_token_new text, add column if not exists email_change text;
    create schema if not exists extensions;
    create or replace function extensions.gen_salt(text) returns text language sql as $$ select 'salt' $$;
    create or replace function extensions.crypt(text, text) returns text language sql as $$ select md5($1 || $2) $$;
    insert into auth.users (id, email, raw_user_meta_data) values
      ('00000000-0000-0000-0000-00000000000a', 'atleta@test.it', '{"full_name":"Nave Test"}'),
      ('00000000-0000-0000-0000-00000000000c', 'rugge@test.it', '{"full_name":"Rugge (test)"}');
    update profiles set role = 'professional' where id = '00000000-0000-0000-0000-00000000000c';
    insert into studios (id, name, created_by) values ('00000000-0000-0000-0000-0000000000a1', 'Vis ae Vis', '00000000-0000-0000-0000-00000000000c');
    insert into care_links (athlete_id, professional_id, studio_id, modules)
      values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', array['training','nutrition','checkin']);
  `);
});

describe("dati di prova", () => {
  it("creano atleti finti con check-in, sedute, chat e promemoria", async () => {
    await db.exec(readFileSync("supabase/seed/demo.sql", "utf8"));
    expect(await count("select count(*) n from care_links where status = 'active'")).toBe(6);
    expect(await count("select count(*) n from weekly_checkins")).toBeGreaterThan(30);
    expect(await count("select count(*) n from daily_entries")).toBeGreaterThan(300);
    expect(await count("select count(*) n from workout_logs")).toBeGreaterThan(50);
    expect(await count("select count(*) n from set_logs")).toBeGreaterThan(300);
    expect(await count("select count(*) n from coach_tasks")).toBe(5);
    expect(await count("select count(*) n from messages")).toBeGreaterThan(18);
    expect(await count("select count(*) n from nutrition_plans where status = 'active'")).toBe(3);
  });

  it("si possono ricaricare senza duplicati", async () => {
    const before = await count("select count(*) n from care_links");
    await db.exec(readFileSync("supabase/seed/demo.sql", "utf8"));
    expect(await count("select count(*) n from care_links")).toBe(before);
    expect(await count("select count(*) n from profiles where full_name = 'Giulia Bassi'")).toBe(1);
  });
});
