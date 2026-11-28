// Giornata dell'atleta: ordine per orario, pasto del momento, integratori e frequenze.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFiberPlan } from "../src/lib/fiber/parseFiber.js";
import { buildDay, mealSummary, mealTime, mealTimeKey, pickNow, timesChosen, toMinutes, weekStart } from "../src/lib/dayPlan.js";

const content = parseFiberPlan(readFileSync("tests/fixtures/fiber-finto.txt", "utf8"), { fileName: "3-Prova-Alimentazione-da-2-Marzo-27.pdf" });
const monday = new Date("2027-03-08T09:00:00"); // giorno A nel piano finto
const at = (h, m = 0) => { const d = new Date(monday); d.setHours(h, m); return d; };
const training = { kind: "training", label: "Allenamento · A", to: "/allenamento" };
const checkin = { morning: { enabled: true, done: true }, evening: { enabled: true, done: false }, weekly: { enabled: false } };

describe("giornata", () => {
  const { dayType, items } = buildDay({ content, date: monday, training, checkin });

  it("usa il tipo di giorno del piano e mette tutto in ordine di orario", () => {
    expect(dayType.key).toBe("A");
    const minutes = items.map(i => toMinutes(i.time));
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
    expect(items[0].id).toBe("checkin:morning");
    expect(items.some(i => i.kind === "training")).toBe(true);
    expect(items.at(-1).kind === "checkin" || items.at(-1).kind === "supplement").toBe(true);
  });

  it("ogni pasto ha orario, riassunto e macro stampati", () => {
    const meals = items.filter(i => i.kind === "meal");
    expect(meals.length).toBe(dayType.meals.filter(m => !/intra/i.test(m.name) || true).length);
    for (const m of meals) { expect(m.detail.length).toBeGreaterThan(0); expect(m.macros?.kcal).toBeGreaterThan(0); }
  });

  it("le fasce orarie dell'atleta hanno la precedenza", () => {
    const meal = dayType.meals[0];
    expect(mealTime(meal, { [mealTimeKey(meal)]: "06:45" })).toBe("06:45");
    const { items: mine } = buildDay({ content, date: monday, training, times: { [mealTimeKey(meal)]: "06:45" } });
    expect(mine[0].id).toBe(`meal:${meal.key}`);
  });

  it("i pasti registrati risultano fatti e il riassunto segue l'alternativa scelta", () => {
    const meal = dayType.meals.find(m => m.groups.some(g => g.options.length > 1));
    const group = meal.groups.find(g => g.options.length > 1);
    const logs = [{ kind: "meal", item_key: meal.key, status: "done", choices: { [group.key]: group.options[1].key } }];
    const { items: done } = buildDay({ content, date: monday, logs });
    const item = done.find(i => i.id === `meal:${meal.key}`);
    expect(item.done).toBe(true);
    expect(item.detail).toBe(mealSummary(meal, logs[0].choices));
    expect(item.detail).toContain(group.options[1].components[0].name);
  });

  it("senza seduta oggi l'intra-workout sparisce", () => {
    const rest = buildDay({ content, date: monday, training: { kind: "rest" } }).items;
    expect(rest.some(i => /intra/i.test(i.title))).toBe(false);
    expect(rest.some(i => i.kind === "training")).toBe(false);
  });
});

describe("adesso", () => {
  const { items } = buildDay({ content, date: monday, training, checkin });
  it("propone la prima cosa non fatta da quest'ora in poi, mai un integratore", () => {
    const now = pickNow(items, at(12, 30));
    expect(now.kind).not.toBe("supplement");
    expect(toMinutes(now.time)).toBeGreaterThanOrEqual(11 * 60 + 30);
  });
  it("a tarda sera resta il check-out serale", () => {
    expect(pickNow(items, at(23, 50)).id).toBe("checkin:evening");
  });
  it("niente da proporre se è tutto fatto", () => {
    expect(pickNow(items.map(i => ({ ...i, done: true })), at(12))).toBeNull();
  });
});

describe("frequenze consigliate", () => {
  it("conta i giorni in cui un'opzione è stata scelta in settimana", () => {
    const logs = [
      { day: "2027-03-08", status: "done", choices: { g1: "tonno" } },
      { day: "2027-03-09", status: "skipped", choices: { g1: "tonno" } },
      { day: "2027-03-10", status: "done", choices: { g1: "pollo" } },
    ];
    expect(timesChosen("tonno", logs)).toEqual(["2027-03-08"]);
    expect(weekStart("2027-03-11")).toBe("2027-03-08");
    expect(weekStart("2027-03-14")).toBe("2027-03-08");
  });
});
