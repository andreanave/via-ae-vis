// Open Food Facts: database aperto di prodotti confezionati (licenza ODbL, citare la fonte).
// Si interroga dal browser solo quando l'utente cerca: i valori scelti entrano nel nostro catalogo
// come prodotto da verificare, con la provenienza scritta nella nota della versione.

const SEARCH = "https://search.openfoodfacts.org/search";
const PRODUCT = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS = "code,product_name,product_name_it,brands,quantity,serving_size,serving_quantity,nutriments," +
  "ingredients_text_it,ingredients_text,allergens_tags,nutrition_data_per,image_nutrition_url";

export const OFF_ATTRIBUTION = "Open Food Facts, licenza ODbL";

export const isBarcode = text => /^\d{8,14}$/.test(String(text ?? "").trim());

const ALLERGENS = {
  gluten: "glutine", milk: "latte", eggs: "uova", nuts: "frutta a guscio", peanuts: "arachidi", soybeans: "soia",
  fish: "pesce", crustaceans: "crostacei", molluscs: "molluschi", celery: "sedano", mustard: "senape",
  "sesame-seeds": "sesamo", "sulphur-dioxide-and-sulphites": "solfiti", lupin: "lupini",
};

const decode = s => String(s ?? "").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const firstBrand = b => decode(Array.isArray(b) ? b[0] : String(b ?? "").split(",")[0]).replace(/^xx:/, "");
const n = v => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

// Ricerca per nome: restituisce codice, nome e marca (i valori si leggono quando si sceglie il prodotto).
export async function searchOff(q, pageSize = 8, fetchFn = fetch) {
  const url = `${SEARCH}?q=${encodeURIComponent(q)}&langs=it&page_size=${pageSize}&fields=code,product_name,brands,quantity`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`off_search_${res.status}`);
  const data = await res.json();
  return (data.hits || []).filter(h => h.code && h.product_name).map(h => ({
    code: h.code, name: decode(h.product_name), brand: firstBrand(h.brands), quantity: h.quantity || "",
  }));
}

export async function getOffProduct(code, fetchFn = fetch) {
  const res = await fetchFn(`${PRODUCT}/${encodeURIComponent(code)}?fields=${FIELDS}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`off_product_${res.status}`);
  const data = await res.json();
  return data.status === 1 || data.product ? data.product : null;
}

// Converte un prodotto Open Food Facts nei campi di add_food. Solo valori dichiarati per 100 g/ml:
// le stime di OFF (nutriments_estimated) non si usano. missing = macro assenti da completare a mano.
export function offToFood(p) {
  const nu = p.nutriments || {};
  const basis = /ml/i.test(p.nutrition_data_per || "") || /\d\s*(ml|cl|l)\b/i.test(p.quantity || "") ? "ml" : "g";
  const kcal = n(nu["energy-kcal_100g"]) ?? (n(nu["energy-kj_100g"]) !== null ? Math.round(n(nu["energy-kj_100g"]) / 4.184) : null);
  const values = {
    kcal, kj: n(nu["energy-kj_100g"]), protein_g: n(nu.proteins_100g), carbs_g: n(nu.carbohydrates_100g),
    sugars_g: n(nu.sugars_100g), fat_g: n(nu.fat_100g), sat_fat_g: n(nu["saturated-fat_100g"]),
    fiber_g: n(nu.fiber_100g), polyols_g: n(nu.polyols_100g), salt_g: n(nu.salt_100g),
  };
  const allergens = (p.allergens_tags || []).map(t => t.replace(/^\w+:/, "")).map(t => ALLERGENS[t] || t);
  const servingG = n(p.serving_quantity);
  return {
    food: {
      name: decode(p.product_name_it || p.product_name), brand: firstBrand(p.brands), variant: "", basis,
      portion_g: servingG, portion_label: decode(p.serving_size) || null, barcode: p.code,
    },
    values,
    ingredients: decode(p.ingredients_text_it || p.ingredients_text) || null,
    allergens,
    note: `Valori da ${OFF_ATTRIBUTION}, codice ${p.code}`,
    missing: ["kcal", "protein_g", "carbs_g", "fat_g"].filter(k => values[k] === null),
    imageUrl: p.image_nutrition_url || null,
  };
}
