// Abbinamento di un nome scritto nel piano (es. "Grana Padano / Parmigiano reggiano") alle voci del catalogo.
// La ricerca vera la fa il database (RPC search_foods); qui si preparano le richieste e si ordinano i risultati.

const STOP = new Set(["di", "del", "della", "dei", "delle", "al", "allo", "alla", "ai", "agli", "alle", "e", "con",
  "in", "da", "o", "il", "lo", "la", "i", "gli", "le", "un", "una", "uno", "per"]);

export function normalize(text) {
  return String(text ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/['’]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

// "A / B" e "A oppure B" indicano alimenti alternativi: ognuno va abbinato da solo.
export function nameVariants(raw) {
  return String(raw ?? "").split(/\s*\/\s*|\s+oppure\s+/i).map(s => s.trim()).filter(Boolean);
}

export function stateHint(name) {
  const n = normalize(name);
  if (/\bsgocciolat/.test(n)) return "drained";
  if (/\b(cott|bollit|lessat|arrost|grigliat|al forno|al vapore)/.test(n)) return "cooked";
  if (/\b(crud|secc)/.test(n)) return "raw";
  return null;
}

export function contentWords(name) {
  return normalize(name).split(" ").filter(w => w.length > 1 && !STOP.has(w));
}

// Richieste dalla più precisa alla più larga: tutte le parole, poi togliendo via via le ultime.
export function searchQueries(name) {
  const words = contentWords(name);
  const out = [];
  for (let n = words.length; n >= 1; n--) out.push(words.slice(0, n).join(" "));
  return out;
}

// Punteggio 0..1: parole in comune, stato coerente, voce verificata.
// Senza indicazione nel nome si preferisce il crudo: i piani riportano di norma il peso a crudo.
export function scoreCandidate(name, food) {
  const want = contentWords(name);
  const have = new Set(contentWords([food.name, food.brand, food.variant].filter(Boolean).join(" ")));
  if (!want.length || !have.size) return 0;
  const common = want.filter(w => have.has(w)).length;
  let score = (common / want.length) * 0.7 + (common / have.size) * 0.2;
  const hint = stateHint(name);
  if (hint ? food.state === hint : food.state == null || food.state === "raw") score += 0.08;
  else if (hint || food.state === "cooked") score -= 0.1;
  if (food.status === "verified") score += 0.02;
  return Math.max(0, Math.min(1, score));
}

// search(q) -> Promise<array di righe come quelle di search_foods>.
// Restituisce, per ogni variante del nome, i candidati ordinati e se il primo è abbastanza sicuro
// da proporlo come abbinamento (il coach conferma comunque nella verifica del piano).
export async function matchFood(name, search) {
  const results = [];
  for (const variant of nameVariants(name)) {
    let candidates = [];
    for (const q of searchQueries(variant)) {
      candidates = await search(q);
      if (candidates?.length) break;
    }
    const ranked = (candidates ?? [])
      .map(food => ({ food, score: scoreCandidate(variant, food) }))
      .sort((a, b) => b.score - a.score);
    const [first, second] = ranked;
    const confident = Boolean(first && first.score >= 0.75 && (!second || first.score - second.score >= 0.05));
    results.push({ name: variant, candidates: ranked, best: first?.food ?? null, confident });
  }
  return results;
}

export function supabaseFoodSearch(supabase, maxRows = 20) {
  return async q => {
    const { data, error } = await supabase.rpc("search_foods", { q, max_rows: maxRows });
    if (error) throw error;
    return data;
  };
}
