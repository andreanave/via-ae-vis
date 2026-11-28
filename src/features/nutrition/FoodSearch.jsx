import { useEffect, useState } from "react";
import { searchFoods } from "../../lib/foodApi.js";
import FoodRow from "./FoodRow.jsx";

// Ricerca nel catalogo comune. onPick riceve la voce scelta; onAdd apre l'inserimento di un prodotto nuovo.
export default function FoodSearch({ onPick, onAdd, autoFocus, selectedId }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setResults(null); return undefined; }
    const t = setTimeout(() => {
      searchFoods(text).then(r => { setResults(r); setError(""); }).catch(() => setError("Non riesco a cercare nel catalogo."));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <input className="input" type="search" placeholder="Cerca un alimento o una marca" aria-label="Cerca nel catalogo"
        autoFocus={autoFocus} value={q} onChange={e => setQ(e.target.value)} />
      {error && <div className="notice error" role="alert">{error}</div>}
      {results && results.length === 0 && <p className="muted">Nessun risultato per «{q.trim()}».</p>}
      {results?.length > 0 && (
        <ul className="list">
          {results.map(f => <FoodRow key={f.id} food={f} active={f.id === selectedId} onClick={onPick ? () => onPick(f) : undefined} />)}
        </ul>
      )}
      {onAdd && q.trim().length >= 2 && (
        <button className="btn secondary" type="button" onClick={() => onAdd(q.trim())}>Non c'è: aggiungi un prodotto</button>
      )}
    </div>
  );
}
