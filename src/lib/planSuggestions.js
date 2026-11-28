// Suggerimenti per il coach su un piano alimentare, ricavati da linee guida generali per adulti.
// Non sono regole: il coach li legge, li valuta e decide se tenerne conto.
//
// Il calcolo è puro: riceve il piano letto da Fiber e una mappa nome alimento -> valori per 100 g
// presi dal catalogo (solo abbinamenti sicuri). Così si può provare con dati finti.

import { normalize } from "./foodMatch.js";

export const GUIDELINE_SOURCES = {
  sugars: "OMS 2015, Guideline: sugars intake for adults and children; CREA, Linee guida per una sana alimentazione, Dossier scientifico 2017, cap. 7",
  polyols: "CREA, Dossier scientifico 2017, cap. 7 (polioli ed effetto lassativo)",
  energy: "Confronto tra i totali stampati da Fiber e i valori del catalogo alimenti",
};

// Alimenti che portano zuccheri liberi (aggiunti, miele, sciroppi, succhi) secondo la definizione OMS.
// Il catalogo dà gli zuccheri totali: per non contare quelli di frutta e latte si sommano solo queste voci.
const FREE_SUGAR_WORDS = [
  /\bmiele\b/, /\bmarmellat/, /\bconfettur/, /\bzucchero\b/, /\bsciropp/, /\bsucc[oh]i?\b/, /\bnettare\b/,
  /\bcioccolat/, /\bbiscott/, /\bgelat[oi]\b/, /\bmerendin/, /\bcrema spalmabile\b/, /\bbibit/, /\baranciata\b/,
  /\bcola\b/, /\bcrostat/, /\btorta\b/, /\bcornett/, /\bbrioche\b/, /\bfrollin/, /\bcaramell/,
];
export const isFreeSugarSource = name => FREE_SUGAR_WORDS.some(re => re.test(normalize(name)));

const grams = c => (c && (c.unit === "g" || c.unit === "ml") && Number(c.qty) > 0 ? Number(c.qty) : null);

// Componenti dell'opzione principale di ogni gruppo: il piano "di base" del giorno.
export function defaultComponents(meal) {
  return (meal.groups || []).flatMap(g => (g.options.find(o => o.isDefault) || g.options[0])?.components || []);
}

// Nomi da cercare nel catalogo per calcolare i suggerimenti di un piano.
export function namesToResolve(content) {
  const names = new Set();
  for (const day of content?.dayTypes || []) {
    for (const meal of day.meals || []) for (const c of defaultComponents(meal)) if (c?.name) names.add(c.name);
  }
  return [...names];
}

const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

// values: { [nome]: { kcal, sugars_g, polyols_g, ... } | null }
// Restituisce { suggestions: [...], coverage: { meals, computed } }.
export function planSuggestions(content, values = {}) {
  const suggestions = [];
  let meals = 0;
  let computed = 0;

  for (const day of content?.dayTypes || []) {
    const dayKcal = Number(day.printed?.kcal || day.mealsSum?.kcal || 0);
    const label = `Giorno ${day.key}`;
    let freeSugars = 0;
    const sugarFoods = [];
    const sugarUnknown = [];
    let polyols = 0;
    const polyolFoods = [];

    for (const meal of day.meals || []) {
      meals += 1;
      let mealKcal = 0;
      let complete = true;
      for (const c of defaultComponents(meal)) {
        const g = grams(c);
        const v = values[c.name];
        if (g === null || !v || v.kcal === null || v.kcal === undefined) complete = false;
        else mealKcal += (Number(v.kcal) * g) / 100;

        if (isFreeSugarSource(c.name)) {
          if (g !== null && v && v.sugars_g !== null && v.sugars_g !== undefined) {
            const s = (Number(v.sugars_g) * g) / 100;
            freeSugars += s;
            sugarFoods.push(`${c.name} ${round(s)} g`);
          } else sugarUnknown.push(c.name);
        }
        if (g !== null && v && Number(v.polyols_g) > 0) {
          const p = (Number(v.polyols_g) * g) / 100;
          polyols += p;
          polyolFoods.push(`${c.name} ${round(p, 1)} g`);
        }
      }

      const printed = Number(meal.printed?.kcal || 0);
      if (complete && printed > 0) {
        computed += 1;
        const diff = mealKcal - printed;
        if (Math.abs(diff) > Math.max(30, printed * 0.1)) {
          suggestions.push({
            id: `energia-${day.key}-${meal.key}`, topic: "energy", day: day.key,
            title: `${label}, ${meal.name}: le calorie del catalogo non tornano con quelle di Fiber`,
            detail: `Fiber stampa ${round(printed)} kcal, con i valori del catalogo il pasto vale circa ${round(mealKcal)} kcal `
              + `(${diff > 0 ? "+" : ""}${round(diff)}). Può dipendere da peso crudo o cotto, da un prodotto diverso o da un refuso.`,
            source: GUIDELINE_SOURCES.energy,
          });
        }
      }
    }

    if (dayKcal > 0 && freeSugars > 0) {
      const share = (freeSugars * 4) / dayKcal;
      if (share > 0.1) {
        suggestions.push({
          id: `zuccheri-${day.key}`, topic: "sugars", day: day.key,
          title: `${label}: zuccheri liberi stimati intorno al ${round(share * 100)}% delle calorie`,
          detail: `L'OMS suggerisce di restare sotto il 10% (meglio sotto il 5%). Stima di circa ${round(freeSugars)} g da: `
            + `${sugarFoods.join(", ")}. Per un atleta in carico può avere senso: valuta tu.`,
          source: GUIDELINE_SOURCES.sugars,
        });
      }
    }
    if (sugarUnknown.length) {
      suggestions.push({
        id: `zuccheri-ignoti-${day.key}`, topic: "sugars", day: day.key, minor: true,
        title: `${label}: zuccheri non stimati per ${[...new Set(sugarUnknown)].join(", ")}`,
        detail: "Alimenti con zuccheri aggiunti senza grammatura o senza un abbinamento sicuro nel catalogo.",
        source: GUIDELINE_SOURCES.sugars,
      });
    }
    if (polyols >= 30) {
      suggestions.push({
        id: `polioli-${day.key}`, topic: "polyols", day: day.key,
        title: `${label}: circa ${round(polyols)} g di polioli`,
        detail: `Da circa 30 g al giorno i polioli (maltitolo, sorbitolo...) possono dare effetti lassativi. Fonti: ${polyolFoods.join(", ")}.`,
        source: GUIDELINE_SOURCES.polyols,
      });
    }
  }
  return { suggestions, coverage: { meals, computed } };
}
