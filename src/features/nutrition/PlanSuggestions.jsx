import { useEffect, useMemo, useState } from "react";
import { Lightbulb } from "lucide-react";
import { getFood, searchFoods } from "../../lib/foodApi.js";
import { matchFood } from "../../lib/foodMatch.js";
import { namesToResolve, planSuggestions } from "../../lib/planSuggestions.js";

// Valori per 100 g dal catalogo, solo per abbinamenti sicuri. La cache vale per la sessione.
const cache = new Map();
async function resolveName(name) {
  if (!cache.has(name)) {
    cache.set(name, (async () => {
      const [first] = await matchFood(name, q => searchFoods(q, 10));
      if (!first?.confident || !first.best) return null;
      const food = await getFood(first.best.id);
      return food?.current || null;
    })().catch(() => null));
  }
  return cache.get(name);
}

async function resolveAll(names, limit = 4) {
  const out = {};
  let i = 0;
  const worker = async () => {
    while (i < names.length) {
      const name = names[i++];
      out[name] = await resolveName(name);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, names.length) }, worker));
  return out;
}

const hiddenKey = planKey => `piano-suggerimenti-nascosti:${planKey}`;
const readHidden = planKey => {
  try { return new Set(JSON.parse(localStorage.getItem(hiddenKey(planKey)) || "[]")); } catch { return new Set(); }
};

// Suggerimenti per il coach sul piano: indicazioni generali, il coach decide se seguirle.
export default function PlanSuggestions({ content, planKey, diet }) {
  const names = useMemo(() => namesToResolve(content), [content]);
  const [values, setValues] = useState(null);
  const [hidden, setHidden] = useState(() => readHidden(planKey));

  useEffect(() => {
    let alive = true;
    setValues(null);
    resolveAll(names).then(v => { if (alive) setValues(v); });
    return () => { alive = false; };
  }, [names]);

  useEffect(() => { setHidden(readHidden(planKey)); }, [planKey]);

  if (!values) return <p className="muted hint">Preparo i suggerimenti sul piano…</p>;
  const { suggestions, coverage } = planSuggestions(content, values, diet);
  const visible = suggestions.filter(s => !hidden.has(s.id));
  const hide = id => {
    const next = new Set(hidden).add(id);
    setHidden(next);
    try { localStorage.setItem(hiddenKey(planKey), JSON.stringify([...next])); } catch { /* solo comodità */ }
  };
  const showAll = () => {
    setHidden(new Set());
    try { localStorage.removeItem(hiddenKey(planKey)); } catch { /* solo comodità */ }
  };

  return (
    <details className="plan-suggestions" open={visible.some(s => !s.minor)}>
      <summary>
        <Lightbulb strokeWidth={1.5} aria-hidden="true" style={{ width: 18, height: 18, verticalAlign: "-3px" }} />
        {" "}Suggerimenti per il coach ({visible.length})
      </summary>
      <p className="muted hint">
        Indicazioni generali per adulti tratte da linee guida (OMS, CREA) e dal catalogo alimenti.
        Le vede solo lo staff, non l'atleta. Valuta tu se tenerne conto.
      </p>
      {visible.length === 0 ? (
        <p className="muted">Nessun suggerimento su questo piano.</p>
      ) : (
        <ul className="lines">
          {visible.map(s => (
            <li key={s.id} className={s.minor ? "muted" : undefined}>
              <strong>{s.title}</strong>
              <div>{s.detail}</div>
              <div className="muted hint">Fonte: {s.source}</div>
              <button type="button" className="btn ghost" onClick={() => hide(s.id)}>Ignora</button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted hint">
        Calorie ricalcolate dal catalogo per {coverage.computed} {coverage.computed === 1 ? "pasto" : "pasti"} su {coverage.meals}: gli altri hanno quantità
        non in grammi (es. «1 porzione») o alimenti senza un abbinamento sicuro.
        {hidden.size > 0 && <> <button type="button" className="btn ghost" onClick={showAll}>Mostra gli ignorati ({hidden.size})</button></>}
      </p>
    </details>
  );
}
