// Calcoli sui valori nutrizionali del catalogo. Valori sempre per 100 g o 100 ml.

export const NUTRIENTS = [
  { key: "kcal", label: "Energia", unit: "kcal" },
  { key: "protein_g", label: "Proteine", unit: "g" },
  { key: "carbs_g", label: "Carboidrati", unit: "g" },
  { key: "sugars_g", label: "di cui zuccheri", unit: "g", sub: true },
  { key: "fat_g", label: "Grassi", unit: "g" },
  { key: "sat_fat_g", label: "di cui saturi", unit: "g", sub: true },
  { key: "fiber_g", label: "Fibre", unit: "g" },
  { key: "salt_g", label: "Sale", unit: "g" },
];
export const MACROS = ["kcal", "protein_g", "carbs_g", "fat_g"];

// Apporto di una quantità: valore per 100 × quantità / 100. Un valore mancante resta mancante.
export function portionValues(per100, amount) {
  const out = {};
  for (const { key } of NUTRIENTS) {
    const v = per100?.[key];
    out[key] = v === null || v === undefined || v === "" ? null : (Number(v) * Number(amount)) / 100;
  }
  return out;
}

// Controllo indicativo 4/4/9 (+2 per le fibre). L'energia usata resta quella dichiarata dalla fonte:
// fibre, polioli e arrotondamenti possono spiegare piccole differenze.
export function energyCheck(v) {
  if ([v?.kcal, v?.protein_g, v?.carbs_g, v?.fat_g].some(x => x === null || x === undefined || x === "")) return null;
  const est = 4 * Number(v.protein_g) + 4 * Number(v.carbs_g) + 9 * Number(v.fat_g)
    + 2 * Number(v.fiber_g || 0) + 2.4 * Number(v.polyols_g || 0) + 7 * Number(v.alcohol_g || 0);
  const diff = Number(v.kcal) - est;
  const tolerance = Math.max(15, est * 0.12);
  return { estimate: Math.round(est), diff: Math.round(diff), ok: Math.abs(diff) <= tolerance };
}

// Errori evidenti prima di salvare: parti che superano 100 g, zuccheri oltre i carboidrati, saturi oltre i grassi.
export function valueProblems(v) {
  const n = k => (v?.[k] === null || v?.[k] === undefined || v?.[k] === "" ? null : Number(v[k]));
  const problems = [];
  const sum = ["protein_g", "carbs_g", "fat_g", "fiber_g"].reduce((s, k) => s + (n(k) ?? 0), 0) + (n("salt_g") ?? 0);
  if (sum > 100.5) problems.push("La somma di proteine, carboidrati, grassi, fibre e sale supera 100 g.");
  if (n("sugars_g") !== null && n("carbs_g") !== null && n("sugars_g") > n("carbs_g")) problems.push("Gli zuccheri superano i carboidrati.");
  if (n("sat_fat_g") !== null && n("fat_g") !== null && n("sat_fat_g") > n("fat_g")) problems.push("I grassi saturi superano i grassi totali.");
  return problems;
}

// Mostra un numero con la precisione adatta: niente decimali inutili, virgola italiana.
export function formatAmount(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "–";
  return Number(value).toLocaleString("it-IT", { maximumFractionDigits: digits });
}
