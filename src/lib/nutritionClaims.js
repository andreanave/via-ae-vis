// Diciture nutrizionali che un alimento rispetta, calcolate dai valori per 100 g o 100 ml
// con le soglie dell'allegato del Reg. CE 1924/2006 (indicazioni nutrizionali).
// Sono un'informazione sul prodotto, non un consiglio: il coach decide come usarla.

export const CLAIMS_SOURCE = "Reg. CE 1924/2006, allegato «Indicazioni nutrizionali e condizioni che si applicano»";

const num = v => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

// Sale dal sodio quando manca (sale = sodio × 2,5).
export function saltOf(v) {
  const salt = num(v?.salt_g);
  if (salt !== null) return salt;
  const sodium = num(v?.sodium_mg);
  return sodium === null ? null : (sodium / 1000) * 2.5;
}

// Ogni regola restituisce true/false, oppure null se mancano i dati per deciderlo.
// "group" tiene insieme le diciture alternative: si mostra solo la più forte del gruppo.
const RULES = [
  { key: "high_protein", group: "protein", label: "Alto contenuto di proteine", rule: "almeno il 20% dell'energia da proteine",
    test: (v) => (v.kcal > 0 && v.protein_g !== null ? (v.protein_g * 4) / v.kcal >= 0.2 : null) },
  { key: "protein_source", group: "protein", label: "Fonte di proteine", rule: "almeno il 12% dell'energia da proteine",
    test: (v) => (v.kcal > 0 && v.protein_g !== null ? (v.protein_g * 4) / v.kcal >= 0.12 : null) },
  { key: "high_fiber", group: "fiber", label: "Alto contenuto di fibre", rule: "almeno 6 g ogni 100 g o 3 g ogni 100 kcal",
    test: (v) => (v.fiber_g === null ? null : v.fiber_g >= 6 || (v.kcal > 0 && (v.fiber_g / v.kcal) * 100 >= 3)) },
  { key: "fiber_source", group: "fiber", label: "Fonte di fibre", rule: "almeno 3 g ogni 100 g o 1,5 g ogni 100 kcal",
    test: (v) => (v.fiber_g === null ? null : v.fiber_g >= 3 || (v.kcal > 0 && (v.fiber_g / v.kcal) * 100 >= 1.5)) },
  { key: "sugar_free", group: "sugars", label: "Senza zuccheri", rule: "non più di 0,5 g di zuccheri",
    test: (v) => (v.sugars_g === null ? null : v.sugars_g <= 0.5) },
  { key: "low_sugar", group: "sugars", label: "A basso contenuto di zuccheri", rule: "non più di 5 g (2,5 g per i liquidi)",
    test: (v, liquid) => (v.sugars_g === null ? null : v.sugars_g <= (liquid ? 2.5 : 5)) },
  { key: "fat_free", group: "fat", label: "Senza grassi", rule: "non più di 0,5 g di grassi",
    test: (v) => (v.fat_g === null ? null : v.fat_g <= 0.5) },
  { key: "low_fat", group: "fat", label: "A basso contenuto di grassi", rule: "non più di 3 g (1,5 g per i liquidi)",
    test: (v, liquid) => (v.fat_g === null ? null : v.fat_g <= (liquid ? 1.5 : 3)) },
  { key: "low_sat_fat", group: "sat", label: "A basso contenuto di grassi saturi",
    rule: "saturi non oltre 1,5 g (0,75 g per i liquidi) e non oltre il 10% dell'energia",
    test: (v, liquid) => (v.sat_fat_g === null ? null
      : v.sat_fat_g <= (liquid ? 0.75 : 1.5) && (!(v.kcal > 0) || (v.sat_fat_g * 9) / v.kcal <= 0.1)) },
  { key: "low_salt", group: "salt", label: "A basso contenuto di sale", rule: "non più di 0,12 g di sodio (0,3 g di sale)",
    test: (v) => (v.salt === null ? null : v.salt <= 0.3) },
  { key: "low_energy", group: "energy", label: "A basso contenuto calorico", rule: "non più di 40 kcal (20 kcal per i liquidi)",
    test: (v, liquid) => (v.kcal === null ? null : v.kcal <= (liquid ? 20 : 40)) },
];

// values: riga di food_versions (per 100). basis: "g" o "ml".
// Restituisce le diciture rispettate, una per gruppo, nell'ordine delle regole.
export function nutritionClaims(values, basis = "g") {
  if (!values) return [];
  const v = {
    kcal: num(values.kcal), protein_g: num(values.protein_g), fiber_g: num(values.fiber_g),
    sugars_g: num(values.sugars_g), fat_g: num(values.fat_g), sat_fat_g: num(values.sat_fat_g), salt: saltOf(values),
  };
  const liquid = basis === "ml";
  const seen = new Set();
  const out = [];
  for (const r of RULES) {
    if (seen.has(r.group)) continue;
    if (r.test(v, liquid) === true) {
      seen.add(r.group);
      out.push({ key: r.key, label: r.label, rule: r.rule });
    }
  }
  return out;
}
