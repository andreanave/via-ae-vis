import { describe, expect, it } from "vitest";
import { energyCheck, formatAmount, portionValues, valueProblems } from "../src/lib/foodMath.js";

describe("calcoli sui valori del catalogo", () => {
  it("apporto della porzione = valore per 100 × grammi / 100", () => {
    const v = portionValues({ kcal: 353, protein_g: 14.6, carbs_g: 69.3, fat_g: 2.4, fiber_g: null }, 80);
    expect(v.kcal).toBeCloseTo(282.4);
    expect(v.protein_g).toBeCloseTo(11.68);
    expect(v.fiber_g).toBe(null);
  });

  it("controllo 4/4/9: il farro CREA torna, una cifra sbagliata no", () => {
    expect(energyCheck({ kcal: 353, protein_g: 14.6, carbs_g: 69.3, fat_g: 2.4, fiber_g: 6.5 }).ok).toBe(true);
    expect(energyCheck({ kcal: 35, protein_g: 14.6, carbs_g: 69.3, fat_g: 2.4 }).ok).toBe(false);
    expect(energyCheck({ kcal: 100, protein_g: null, carbs_g: 1, fat_g: 1 })).toBe(null);
  });

  it("segnala valori impossibili", () => {
    expect(valueProblems({ protein_g: 60, carbs_g: 50, fat_g: 1 })).toHaveLength(1);
    expect(valueProblems({ carbs_g: 10, sugars_g: 12, fat_g: 1, sat_fat_g: 2 })).toHaveLength(2);
    expect(valueProblems({ protein_g: 8, carbs_g: 48, fat_g: 8.5, salt_g: 1.6 })).toEqual([]);
  });

  it("formatta con la virgola e senza decimali inutili", () => {
    expect(formatAmount(8.5)).toBe("8,5");
    expect(formatAmount(300)).toBe("300");
    expect(formatAmount(null)).toBe("–");
  });
});
