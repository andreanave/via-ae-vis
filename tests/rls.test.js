// Scenario 1: un atleta con due professionisti; un coach di un altro studio non vede nulla.
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
let db;

const as = async (key, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ids[key]}', false);
    select set_config('request.jwt.claim.email', '${email(key)}', false);`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
};
const rows = async (key, sql) => as(key, async () => (await db.query(sql)).rows);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("tests/supabaseStub.sql", "utf8"));
  for (const f of readdirSync("supabase/migrations").sort()) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  }
  for (const [key, id] of Object.entries(ids)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
      [id, email(key), JSON.stringify({ full_name: key })]);
  }
  await db.exec(`update profiles set role = 'professional' where id in ('${ids.coach}', '${ids.nutri}', '${ids.other}');
    update profiles set is_master = true where id = '${ids.master}';`);
});

describe("inviti e collegamenti", () => {
  it("il coach invita, l'atleta accetta con la propria e-mail", async () => {
    const [inv] = await rows("coach", `insert into invites (email, invited_by, modules)
      values ('${email("athlete")}', '${ids.coach}', array['training','checkin']) returning token`);
    await as("athlete", () => db.query("select accept_invite($1)", [inv.token]));
    const [inv2] = await rows("nutri", `insert into invites (email, invited_by, modules)
      values ('${email("athlete")}', '${ids.nutri}', array['nutrition','checkin']) returning token`);
    await as("athlete", () => db.query("select accept_invite($1)", [inv2.token]));
    expect(await rows("athlete", "select professional_id from care_links")).toHaveLength(2);
  });

  it("un invito non può essere accettato da un'altra e-mail", async () => {
    const [inv] = await rows("coach", `insert into invites (email, invited_by) values ('x@test.local', '${ids.coach}') returning token`);
    await expect(as("other", () => db.query("select accept_invite($1)", [inv.token]))).rejects.toThrow(/invite_email_mismatch/);
  });

  it("un invito scaduto viene rifiutato", async () => {
    const [inv] = await rows("coach", `insert into invites (email, invited_by, expires_at)
      values ('${email("other")}', '${ids.coach}', now() - interval '1 day') returning token`);
    await expect(as("other", () => db.query("select accept_invite($1)", [inv.token]))).rejects.toThrow(/invite_expired/);
  });

  it("un atleta non può creare inviti", async () => {
    await expect(rows("athlete", `insert into invites (email, invited_by) values ('y@test.local', '${ids.athlete}')`)).rejects.toThrow();
  });
});

describe("visibilità", () => {
  it("coach e nutrizionista vedono l'atleta", async () => {
    expect(await rows("coach", `select id from profiles where id = '${ids.athlete}'`)).toHaveLength(1);
    expect(await rows("nutri", `select id from profiles where id = '${ids.athlete}'`)).toHaveLength(1);
  });

  it("il coach di un altro studio non vede l'atleta né i collegamenti", async () => {
    expect(await rows("other", `select id from profiles where id = '${ids.athlete}'`)).toHaveLength(0);
    expect(await rows("other", "select id from care_links")).toHaveLength(0);
  });

  it("il master vede tutti", async () => {
    expect(await rows("master", "select id from profiles")).toHaveLength(5);
  });

  it("nessuno può promuoversi a professionista o master", async () => {
    await expect(rows("athlete", `update profiles set role = 'professional' where id = '${ids.athlete}'`)).rejects.toThrow();
    await expect(rows("athlete", `update profiles set is_master = true where id = '${ids.athlete}'`)).rejects.toThrow();
    await rows("athlete", `update profiles set full_name = 'Andrea' where id = '${ids.athlete}'`);
    expect((await rows("athlete", `select full_name from profiles where id = '${ids.athlete}'`))[0].full_name).toBe("Andrea");
  });
});

describe("note e promemoria del coach", () => {
  it("la nota del coach è privata rispetto al nutrizionista e all'atleta", async () => {
    await rows("coach", `insert into coach_notes (athlete_id, professional_id, body) values ('${ids.athlete}', '${ids.coach}', 'nota')`);
    expect(await rows("nutri", "select * from coach_notes")).toHaveLength(0);
    expect(await rows("athlete", "select * from coach_notes")).toHaveLength(0);
    expect(await rows("coach", "select * from coach_notes")).toHaveLength(1);
  });

  it("un coach non può scrivere note su un atleta che non segue", async () => {
    await expect(rows("other", `insert into coach_notes (athlete_id, professional_id, body) values ('${ids.athlete}', '${ids.other}', 'x')`)).rejects.toThrow();
  });
});
