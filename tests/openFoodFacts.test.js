import { describe, expect, it } from "vitest";
import { getOffProduct, isBarcode, offToFood, searchOff } from "../src/lib/openFoodFacts.js";

// Risposta reale ridotta (piadina, 2026-11-28).
const piadina = {
  code: "8017596014269", product_name: "Piadina romagnola IGP alla riminese con olio extra vergine di oliva",
  brands: "DE MICOLI", quantity: "360 g", serving_size: "1 Piadina (120 g)", serving_quantity: 120,
  ingredients_text_it: "farina di grano tenero tipo &quot;00&quot;, acqua, olio extravergine di olive (6%), sale",
  allergens_tags: ["en:gluten"],
  nutriments: { "energy-kcal_100g": 290, "energy-kj_100g": 1222.5, proteins_100g: 8.2, carbohydrates_100g: 48,
    sugars_100g: 1, fat_100g: 6.7, "saturated-fat_100g": 1.1, fiber_100g: 2.4, salt_100g: 1.77 },
};
const fakeFetch = body => async () => ({ ok: true, status: 200, json: async () => body });

describe("Open Food Facts", () => {
  it("riconosce un codice a barre", () => {
    expect(isBarcode("8017596014269")).toBe(true);
    expect(isBarcode("piadina")).toBe(false);
  });

  it("converte un prodotto nei campi del catalogo", () => {
    const r = offToFood(piadina);
    expect(r.food).toMatchObject({ brand: "DE MICOLI", basis: "g", portion_g: 120, barcode: "8017596014269" });
    expect(r.values).toMatchObject({ kcal: 290, protein_g: 8.2, carbs_g: 48, fat_g: 6.7, salt_g: 1.77 });
    expect(r.ingredients).toContain('tipo "00"');
    expect(r.allergens).toEqual(["glutine"]);
    expect(r.missing).toEqual([]);
    expect(r.note).toMatch(/Open Food Facts.*8017596014269/);
  });

  it("segnala i macro mancanti e ricava le kcal dai kJ", () => {
    const r = offToFood({ code: "1", product_name: "Succo", quantity: "1 l", nutriments: { "energy-kj_100g": 184, carbohydrates_100g: 10 } });
    expect(r.food.basis).toBe("ml");
    expect(r.values.kcal).toBe(44);
    expect(r.missing).toEqual(["protein_g", "fat_g"]);
  });

  it("legge i risultati della ricerca", async () => {
    const hits = await searchOff("piadina", 8, fakeFetch({ hits: [{ code: "1", product_name: "Piadina", brands: ["xx:coop"] }, { code: "2" }] }));
    expect(hits).toEqual([{ code: "1", name: "Piadina", brand: "coop", quantity: "" }]);
  });

  it("un codice sconosciuto restituisce null", async () => {
    expect(await getOffProduct("0", async () => ({ ok: false, status: 404 }))).toBe(null);
  });
});
