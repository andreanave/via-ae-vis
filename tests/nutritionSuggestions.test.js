import { describe, expect, it } from "vitest";
import { nutritionClaims, saltOf } from "../src/lib/nutritionClaims.js";
import { isFreeSugarSource, namesToResolve, planSuggestions } from "../src/lib/planSuggestions.js";

const keys = (v, basis) => nutritionClaims(v, basis).map(c => c.key);

describe("diciture nutrizionali (Reg. 1924/2006)", () => {
  it("petto di pollo: alto in proteine, senza zuccheri, pochi grassi", () => {
    const k = keys({ kcal: 100, protein_g: 23, fat_g: 0.8, sat_fat_g: 0.3, sugars_g: 0, fiber_g: 0, salt_g: 0.15 });
    expect(k).toEqual(expect.arrayContaining(["high_protein", "sugar_free", "low_fat", "low_sat_fat", "low_salt"]));
    expect(k).not.toContain("protein_source");
  });

  it("fonte di proteine tra 12% e 20% dell'energia", () => {
    expect(keys({ kcal: 353, protein_g: 14.6 })).toContain("protein_source");
    expect(keys({ kcal: 353, protein_g: 8 })).not.toContain("protein_source");
  });

  it("fibre: per 100 g o per 100 kcal", () => {
    expect(keys({ kcal: 353, fiber_g: 6.5 })).toContain("high_fiber");
    expect(keys({ kcal: 30, fiber_g: 1 })).toContain("high_fiber"); // 3,3 g per 100 kcal
    expect(keys({ kcal: 350, fiber_g: 3.1 })).toContain("fiber_source");
  });

  it("i liquidi hanno soglie più basse", () => {
    expect(keys({ kcal: 46, sugars_g: 4.9, fat_g: 1.6 }, "g")).toEqual(expect.arrayContaining(["low_sugar", "low_fat"]));
    expect(keys({ kcal: 46, sugars_g: 4.9, fat_g: 1.6 }, "ml")).not.toContain("low_sugar");
    expect(keys({ kcal: 46, sugars_g: 4.9, fat_g: 1.6 }, "ml")).not.toContain("low_fat");
  });

  it("grassi saturi: anche il limite del 10% dell'energia", () => {
    expect(keys({ kcal: 10, sat_fat_g: 1.4 })).not.toContain("low_sat_fat");
  });

  it("sale dal sodio e niente diciture senza dati", () => {
    expect(saltOf({ sodium_mg: 100 })).toBeCloseTo(0.25);
    expect(nutritionClaims({ kcal: null })).toEqual([]);
    expect(nutritionClaims(null)).toEqual([]);
  });
});

const comp = (name, qty, unit = "g") => ({ name, qty, unit });
const meal = (key, kcal, ...components) => ({ key, name: key, printed: { kcal }, groups: components.map((c, i) => ({
  key: `${key}.${i}`, options: [{ isDefault: true, components: [c] }, { isDefault: false, components: [comp("Alternativa", 10)] }],
})) });

const catalog = {
  "Fiocchi d'avena": { kcal: 370, sugars_g: 1 },
  "Miele": { kcal: 304, sugars_g: 80 },
  "Marmellata": { kcal: 250, sugars_g: 60 },
  "Barretta proteica": { kcal: 350, sugars_g: 2, polyols_g: 20 },
  "Petto di pollo": { kcal: 100, sugars_g: 0 },
};

describe("suggerimenti sul piano per il coach", () => {
  it("riconosce le fonti di zuccheri liberi dal nome", () => {
    expect(isFreeSugarSource("Miele millefiori")).toBe(true);
    expect(isFreeSugarSource("Succo di arancia")).toBe(true);
    expect(isFreeSugarSource("Mela")).toBe(false);
    expect(isFreeSugarSource("Yogurt bianco magro")).toBe(false);
  });

  it("considera solo l'opzione principale di ogni gruppo", () => {
    const content = { dayTypes: [{ key: "A", printed: { kcal: 2000 }, meals: [meal("Colazione", 300, comp("Fiocchi d'avena", 80))] }] };
    expect(namesToResolve(content)).toEqual(["Fiocchi d'avena"]);
  });

  it("zuccheri liberi sopra il 10%: suggerimento con stima e fonte", () => {
    const content = { dayTypes: [{ key: "A", printed: { kcal: 1500 }, meals: [
      meal("Colazione", 500, comp("Miele", 30), comp("Marmellata", 40)),
    ] }] };
    const { suggestions } = planSuggestions(content, catalog);
    const s = suggestions.find(x => x.topic === "sugars");
    // 24 + 24 = 48 g -> 192 kcal su 1500 = 13%
    expect(s.title).toContain("13%");
    expect(s.source).toMatch(/OMS/);
  });

  it("sotto il 10% nessun suggerimento sugli zuccheri", () => {
    const content = { dayTypes: [{ key: "A", printed: { kcal: 3000 }, meals: [meal("Colazione", 300, comp("Miele", 15))] }] };
    expect(planSuggestions(content, catalog).suggestions.filter(s => s.topic === "sugars")).toEqual([]);
  });

  it("calorie del pasto lontane da quelle di Fiber", () => {
    const content = { dayTypes: [{ key: "B", printed: { kcal: 2000 }, meals: [
      meal("Pranzo", 500, comp("Petto di pollo", 150)),     // 150 kcal contro 500
      meal("Cena", 290, comp("Fiocchi d'avena", 80)),       // 296 contro 290: ok
      meal("Spuntino", 100, comp("Frutta", 1, "porzione")), // non calcolabile
    ] }] };
    const { suggestions, coverage } = planSuggestions(content, catalog);
    expect(suggestions.filter(s => s.topic === "energy").map(s => s.id)).toEqual(["energia-B-Pranzo"]);
    expect(coverage).toEqual({ meals: 3, computed: 2 });
  });

  it("polioli da 30 g al giorno", () => {
    const content = { dayTypes: [{ key: "A", printed: { kcal: 2500 }, meals: [
      meal("Spuntino", 350, comp("Barretta proteica", 100)), meal("Merenda", 280, comp("Barretta proteica", 80)),
    ] }] };
    expect(planSuggestions(content, catalog).suggestions.some(s => s.topic === "polyols")).toBe(true);
  });

  it("zuccheri non stimabili: nota minore, non un allarme", () => {
    const content = { dayTypes: [{ key: "A", printed: { kcal: 2000 }, meals: [meal("Colazione", 100, comp("Miele", 1, "cucchiaino"))] }] };
    const s = planSuggestions(content, catalog).suggestions;
    expect(s).toHaveLength(1);
    expect(s[0].minor).toBe(true);
  });
});

describe("intolleranze e allergie nei suggerimenti", () => {
  const dairy = { "Yogurt bianco": { kcal: 60, sugars_g: 4.5 }, "Latte parzialmente scremato": { kcal: 46, sugars_g: 5 },
    "Latte senza lattosio": { kcal: 46, sugars_g: 0.1 }, "Parmigiano": { kcal: 390, sugars_g: 0 } };

  it("riconosce latticini e allergeni dal nome", async () => {
    const { isLactoseSource, allergensInName } = await import("../src/lib/planSuggestions.js");
    expect(isLactoseSource("Yogurt greco 0%")).toBe(true);
    expect(isLactoseSource("Latte senza lattosio")).toBe(false);
    expect(isLactoseSource("Latte di soia")).toBe(false);
    expect(allergensInName("Pasta integrale")).toEqual(["glutine"]);
    expect(allergensInName("Filetto di tonno")).toEqual(["pesce"]);
    expect(allergensInName("Mandorle tostate")).toEqual(["frutta_a_guscio"]);
  });

  it("lattosio oltre 12 g in un pasto solo se l'atleta è intollerante", () => {
    const content = { dayTypes: [{ key: "A", printed: { kcal: 2000 }, meals: [
      meal("Colazione", 300, comp("Latte parzialmente scremato", 250), comp("Yogurt bianco", 125)),
    ] }] };
    expect(planSuggestions(content, dairy).suggestions.filter(s => s.topic === "lactose")).toEqual([]);
    const s = planSuggestions(content, dairy, { lactose_intolerant: true }).suggestions.filter(x => x.topic === "lactose");
    expect(s).toHaveLength(1);
    expect(s[0].title).toContain("18 g"); // 12,5 + 5,6
  });

  it("latte senza lattosio non conta", () => {
    const content = { dayTypes: [{ key: "A", printed: { kcal: 2000 }, meals: [meal("Colazione", 300, comp("Latte senza lattosio", 500))] }] };
    expect(planSuggestions(content, dairy, { lactose_intolerant: true }).suggestions.filter(s => s.topic === "lactose")).toEqual([]);
  });

  it("segnala gli allergeni dell'atleta anche nelle alternative", () => {
    const content = { dayTypes: [{ key: "A", printed: { kcal: 2000 }, meals: [
      { key: "Pranzo", name: "Pranzo", printed: { kcal: 0 }, groups: [{ key: "g1", options: [
        { key: "o1", isDefault: true, components: [comp("Petto di pollo", 100)] },
        { key: "o2", isDefault: false, components: [comp("Gamberi", 150)] },
      ] }] },
    ] }] };
    expect(planSuggestions(content, {}, { allergens: ["pesce"] }).suggestions).toEqual([]);
    const s = planSuggestions(content, {}, { allergens: ["crostacei"] }).suggestions;
    expect(s).toHaveLength(1);
    expect(s[0].title).toMatch(/Gamberi.*alternativa.*allergia a crostacei/);
  });
});
