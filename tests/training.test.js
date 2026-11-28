import { describe, expect, it } from "vitest";
import { groupBlocks, isTrainingDay, nextSession, planForDay, previousSets, restRemaining, setTarget, upcomingDays } from "../src/lib/trainingRotation.js";
import { createOutbox } from "../src/lib/trainingOutbox.js";

const program = { id: "p", training_weekdays: [1, 3, 5] }; // lun, mer, ven
const sessions = ["A", "B", "C", "D"].map((name, position) => ({ id: `s${name}`, name, position }));
const log = (day, name, status = "done") => ({ id: `w-${day}`, program_id: "p", session_id: `s${name}`, session_name: name, performed_on: day, status });

describe("rotazione delle sedute", () => {
  it("con 3 giorni e 4 sedute, dopo A, B, C la prossima è D e poi si torna ad A", () => {
    const logs = [log("2026-11-30", "A"), log("2026-12-02", "B"), log("2026-12-04", "C")];
    expect(nextSession(sessions, logs, "p").name).toBe("D");
    const next = upcomingDays({ from: "2026-12-05", days: 5, program, sessions, logs, overrides: [] });
    expect(next.filter(d => d.kind === "training").map(d => [d.day, d.session.name]))
      .toEqual([["2026-12-07", "D"], ["2026-12-09", "A"]]);
  });

  it("una seduta saltata non fa avanzare la rotazione", () => {
    const logs = [log("2026-11-30", "A"), log("2026-12-02", "B", "skipped")];
    expect(nextSession(sessions, logs, "p").name).toBe("B");
    const days = upcomingDays({ from: "2026-12-02", days: 3, program, sessions, logs, overrides: [] });
    expect(days.map(d => [d.kind, d.session?.name])).toEqual([["skipped", undefined], ["rest", undefined], ["training", "B"]]);
    expect(planForDay({ day: "2026-12-02", program, sessions, logs, overrides: [] }).kind).toBe("skipped");
  });

  it("l'atleta sposta l'allenamento: martedì diventa di allenamento, mercoledì di riposo", () => {
    const overrides = [{ day: "2026-12-01", kind: "training" }, { day: "2026-12-02", kind: "rest" }];
    expect(isTrainingDay("2026-12-01", program.training_weekdays, overrides)).toBe(true);
    expect(isTrainingDay("2026-12-02", program.training_weekdays, overrides)).toBe(false);
    const days = upcomingDays({ from: "2026-11-30", days: 5, program, sessions, logs: [], overrides });
    expect(days.filter(d => d.kind === "training").map(d => d.session.name)).toEqual(["A", "B", "C"]);
  });

  it("propone di riprendere una seduta lasciata aperta", () => {
    const logs = [log("2026-11-30", "A", "in_progress")];
    expect(planForDay({ day: "2026-11-30", program, sessions, logs, overrides: [] }).kind).toBe("resume");
    expect(planForDay({ day: "2026-12-01", program, sessions, logs: [], overrides: [] }).kind).toBe("rest");
  });
});

describe("dettagli della seduta", () => {
  it("le prestazioni precedenti arrivano dall'ultima seduta completata", () => {
    const workouts = [log("2026-11-23", "A"), log("2026-11-30", "A")];
    const sets = [
      { workout_id: "w-2026-11-23", session_exercise_id: "e1", set_index: 0, load: 70, reps: 8 },
      { workout_id: "w-2026-11-30", session_exercise_id: "e1", set_index: 1, load: 75, reps: 7 },
      { workout_id: "w-2026-11-30", session_exercise_id: "e1", set_index: 0, load: 75, reps: 9 },
    ];
    const prev = previousSets({ exercise: { id: "e1", name: "Squat" }, workouts, sets });
    expect(prev.sets.map(s => s.reps)).toEqual([9, 7]);
  });

  it("i dettagli per serie sostituiscono la prescrizione generale", () => {
    const ex = { reps: "7-11", load: "Carico fisso", rir: "1", set_details: [{}, { reps: "5", rir: "0" }] };
    expect(setTarget(ex, 0)).toMatchObject({ reps: "7-11", rir: "1" });
    expect(setTarget(ex, 1)).toMatchObject({ reps: "5", rir: "0", load: "Carico fisso" });
  });

  it("A1 e A2 formano un jump set", () => {
    const blocks = groupBlocks([
      { id: 1, position: 0, group_label: "A1" }, { id: 2, position: 1, group_label: "A2" }, { id: 3, position: 2, group_label: "" },
    ]);
    expect(blocks.map(b => b.items.length)).toEqual([2, 1]);
  });

  it("il recupero si calcola dall'orario di fine", () => {
    expect(restRemaining(10_000 + 90_000, 10_000)).toBe(90);
    expect(restRemaining(1000, 5000)).toBe(0);
  });
});

describe("coda offline", () => {
  const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  const fakeClient = (fail = false) => {
    const tables = { workout_logs: new Map(), set_logs: new Map() };
    return {
      tables,
      from: name => ({
        upsert: async rows => {
          if (fail) return { error: new Error("offline") };
          for (const r of [].concat(rows)) tables[name].set(r.id, r);
          return { error: null };
        },
        delete: () => ({ in: async (_c, list) => { list.forEach(id => tables[name].delete(id)); return { error: null }; } }),
      }),
    };
  };

  it("senza rete i dati restano in coda; con la rete partono una volta sola", async () => {
    const box = createOutbox("a", memory());
    box.putWorkout({ id: "w1", athlete_id: "a", performed_on: "2026-11-30", status: "in_progress" });
    box.putSet("w1", { id: "s1", set_index: 0, load: 80, reps: 8 });
    expect(await box.flush(fakeClient(true))).toEqual({ sent: 0, failed: 1 });
    expect(box.pendingCount()).toBe(1);

    const client = fakeClient();
    await box.flush(client);
    box.putWorkout({ id: "w1", status: "done" });
    box.putSet("w1", { id: "s1", reps: 9 });
    await box.flush(client);
    expect(box.pendingCount()).toBe(0);
    expect(client.tables.workout_logs.size).toBe(1);
    expect(client.tables.set_logs.get("s1")).toMatchObject({ load: 80, reps: 9 });
  });
});
