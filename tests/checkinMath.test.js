import { describe, expect, it } from "vitest";
import { aggregateField, groupEntries, missingRequired, resolveWeeklyValue, weekDays, weekEndFor } from "../src/lib/checkinMath.js";

const entry = (day, moment, values) => ({ day, moment, values });
const cell = (v, extra = {}) => ({ v, source: "manual", ...extra });

describe("settimana", () => {
  it("la settimana finisce nel giorno scelto dal coach", () => {
    // 2026-11-27 è venerdì: con domenica (0) la settimana finisce il 29.
    expect(weekEndFor("2026-11-27", 0)).toBe("2026-11-29");
    expect(weekEndFor("2026-11-29", 0)).toBe("2026-11-29");
    expect(weekDays("2026-11-29")).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
  });
});

describe("medie e conteggi", () => {
  const days = weekDays("2026-11-29");

  it("media dei passi solo sui giorni presenti: 8.000 su tre giorni", () => {
    const byDay = groupEntries([
      entry("2026-11-23", "evening", { steps: cell(8000) }),
      entry("2026-11-25", "evening", { steps: cell(7000) }),
      entry("2026-11-27", "evening", { steps: cell(9000) }),
    ]);
    const agg = aggregateField("steps", days, byDay);
    expect(agg.value).toBe(8000);
    expect(agg.count).toBe(3);
  });

  it("uno zero inserito è un valore valido", () => {
    const byDay = groupEntries([
      entry("2026-11-23", "evening", { steps: cell(0) }),
      entry("2026-11-24", "evening", { steps: cell(6000) }),
    ]);
    expect(aggregateField("steps", days, byDay)).toMatchObject({ value: 3000, count: 2 });
  });

  it("peso medio con numero di pesate", () => {
    const byDay = groupEntries([
      entry("2026-11-24", "morning", { weight: cell(72.4) }),
      entry("2026-11-27", "morning", { weight: cell(72.0) }),
    ]);
    expect(aggregateField("weight", days, byDay)).toMatchObject({ value: 72.2, count: 2 });
  });

  it("le sedute svolte si sommano", () => {
    const byDay = groupEntries([
      entry("2026-11-23", "evening", { workouts_done: cell(1) }),
      entry("2026-11-25", "evening", { workouts_done: cell(1) }),
    ]);
    expect(aggregateField("workouts_done", days, byDay).value).toBe(2);
  });

  it("un valore corretto a mano conta una sola volta e resta riconoscibile", () => {
    const byDay = groupEntries([
      entry("2026-11-23", "morning", { weight: cell(80, { source: "health", edited: true }) }),
    ]);
    const agg = aggregateField("weight", days, byDay);
    expect(agg.count).toBe(1);
    expect(agg.sources[0]).toMatchObject({ source: "health", edited: true });
  });

  it("i giorni fuori dalla settimana non contano", () => {
    const byDay = groupEntries([entry("2026-11-22", "evening", { steps: cell(20000) })]);
    expect(aggregateField("steps", days, byDay)).toMatchObject({ value: null, count: 0 });
  });
});

describe("correzioni e obbligatori", () => {
  it("la correzione dell'atleta prevale e si vede da dove arriva", () => {
    const r = resolveWeeklyValue({ value: 8000, count: 3 }, { v: 8500 });
    expect(r).toEqual({ value: 8500, origin: "override", computed: 8000, count: 3 });
  });

  it("il settimanale si compila anche senza giornalieri", () => {
    expect(resolveWeeklyValue({ value: null, count: 0 }, { v: 7500 }).value).toBe(7500);
  });

  it("indica i campi obbligatori mancanti nell'ordine del modulo", () => {
    const cfg = [
      { key: "weight", required: true },
      { key: "steps", required: false },
      { key: "workouts_comment", required: true },
      { key: "stress", required: true },
    ];
    const resolved = { weight: { value: 72 }, stress: { value: null } };
    expect(missingRequired(cfg, resolved, { workouts_comment: "  " })).toEqual(["workouts_comment", "stress"]);
    expect(missingRequired(cfg, { weight: { value: 72 }, stress: { value: 0 } }, { workouts_comment: "ok" })).toEqual([]);
  });
});

import { pickSuggestion } from "../src/features/athlete/AthleteHome.jsx";
describe("proposta della Home", () => {
  const config = { morning: ["weight"], evening: ["steps"], weekly: [{ key: "weight" }] };
  it("al mattino propone il check-in del mattino", () => {
    expect(pickSuggestion({ hour: 7, config, today: {}, weekly: null, isWeeklyDay: false })).toBe("morning");
  });
  it("se il mattino è fatto e sono le 10, non propone nulla", () => {
    expect(pickSuggestion({ hour: 10, config, today: { morning: { status: "done" } }, weekly: null, isWeeklyDay: false })).toBe(null);
  });
  it("la sera propone il check-out", () => {
    expect(pickSuggestion({ hour: 21, config, today: {}, weekly: null, isWeeklyDay: false })).toBe("evening");
  });
  it("nel giorno del resoconto propone il settimanale", () => {
    expect(pickSuggestion({ hour: 15, config, today: {}, weekly: null, isWeeklyDay: true })).toBe("weekly");
  });
});
