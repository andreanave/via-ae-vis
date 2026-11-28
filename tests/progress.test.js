import { describe, expect, it } from "vitest";
import { dailyPoints, liftProgress, progressText, weeklySeries, workoutsPerWeek } from "../src/lib/progress.js";

const today = "2026-11-28"; // sabato: la settimana con consegna la domenica finisce il 29
const e = (day, values) => ({ day, values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { v }])) });
const entries = [
  e("2026-11-24", { weight: 82.0, steps: 8000 }), e("2026-11-25", { steps: 7000 }), e("2026-11-27", { weight: 81.6, steps: 9000 }),
  e("2026-11-17", { weight: 82.4, steps: 0 }),
];

describe("andamento", () => {
  it("media settimanale solo sui giorni presenti, con il conteggio; lo zero conta", () => {
    const w = weeklySeries(entries, "weight", { today, weeks: 3 });
    expect(w.map(x => x.weekEnd)).toEqual(["2026-11-15", "2026-11-22", "2026-11-29"]);
    expect(w[2]).toMatchObject({ count: 2 });
    expect(w[2].value).toBeCloseTo(81.8);
    expect(w[0].value).toBeNull();
    const s = weeklySeries(entries, "steps", { today, weeks: 2 });
    expect(s[1]).toMatchObject({ value: 8000, count: 3 });
    expect(s[0]).toMatchObject({ value: 0, count: 1 });
    expect(dailyPoints(entries, "weight").map(p => p.day)).toEqual(["2026-11-17", "2026-11-24", "2026-11-27"]);
  });

  it("sedute per settimana e carichi migliori", () => {
    const workouts = [
      { id: "w1", performed_on: "2026-11-16", status: "done" }, { id: "w2", performed_on: "2026-11-23", status: "done" },
      { id: "w3", performed_on: "2026-11-25", status: "skipped" },
    ];
    expect(workoutsPerWeek(workouts, { today, weeks: 2 })).toEqual([
      { weekEnd: "2026-11-22", done: 1, skipped: 0 }, { weekEnd: "2026-11-29", done: 1, skipped: 1 }]);
    const sets = [
      { workout_id: "w1", exercise_name: "Panca", load: 70 }, { workout_id: "w1", exercise_name: "Panca", load: 72.5 },
      { workout_id: "w2", exercise_name: "Panca", load: 75 }, { workout_id: "w2", exercise_name: "Trazioni", load: 0 },
      { workout_id: "w3", exercise_name: "Panca", load: 99 },
    ];
    const lifts = liftProgress(sets, workouts);
    expect(lifts).toHaveLength(1);
    expect(lifts[0]).toMatchObject({ name: "Panca", first: 72.5, last: 75 });
    const text = progressText({ weight: weeklySeries(entries, "weight", { today, weeks: 3 }), steps: [], sleep: [], workouts: workoutsPerWeek(workouts, { today, weeks: 2 }), lifts });
    expect(text).toContain("81,8 kg");
    expect(text).toContain("−0,6 kg");
    expect(text).toContain("2 sedute fatte");
    expect(text).toContain("72,5 → 75 kg");
  });
});
