import { useEffect, useState } from "react";
import { searchFoods } from "../../lib/foodApi.js";
import { getOffProduct, isBarcode, offToFood, searchOff } from "../../lib/openFoodFacts.js";
import FoodRow from "./FoodRow.jsx";

// Ricerca nel catalogo comune. onPick riceve la voce scelta; onAdd(nome, prefill?) apre l'inserimento
// di un prodotto nuovo, eventualmente già compilato con i dati di Open Food Facts.
export default function FoodSearch({ onPick, onAdd, autoFocus, selectedId }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [off, setOff] = useState(null);
  const [offState, setOffState] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const text = q.trim();
    setOff(null);
    setOffState("");
    if (text.length < 2) { setResults(null); return undefined; }
    const t = setTimeout(() => {
      searchFoods(text).then(r => { setResults(r); setError(""); }).catch(() => setError("Non riesco a cercare nel catalogo."));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Open Food Facts solo su richiesta (o subito per un codice a barre), per non interrogarlo a ogni tasto.
  const lookOff = async () => {
    const text = q.trim();
    setOffState("loading");
    try {
      if (isBarcode(text)) {
        const p = await getOffProduct(text);
        setOff(p ? [{ code: p.code, name: offToFood(p).food.name, brand: offToFood(p).food.brand, product: p }] : []);
      } else {
        setOff(await searchOff(text));
      }
      setOffState("");
    } catch {
      setOffState("error");
    }
  };
  useEffect(() => {
    if (onAdd && isBarcode(q.trim()) && results && results.length === 0) lookOff();
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickOff = async hit => {
    setOffState("loading");
    try {
      const p = hit.product || (await getOffProduct(hit.code));
      setOffState("");
      if (p) onAdd(hit.name, offToFood(p));
    } catch {
      setOffState("error");
    }
  };

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <input className="input" type="search" placeholder="Cerca un alimento, una marca o un codice a barre" aria-label="Cerca nel catalogo"
        autoFocus={autoFocus} value={q} onChange={e => setQ(e.target.value)} />
      {error && <div className="notice error" role="alert">{error}</div>}
      {results && results.length === 0 && <p className="muted">Nessun risultato nel catalogo per «{q.trim()}».</p>}
      {results?.length > 0 && (
        <ul className="list">
          {results.map(f => <FoodRow key={f.id} food={f} active={f.id === selectedId} onClick={onPick ? () => onPick(f) : undefined} />)}
        </ul>
      )}
      {onAdd && q.trim().length >= 3 && off === null && (
        <button className="btn secondary" type="button" onClick={lookOff} disabled={offState === "loading"}>
          {offState === "loading" ? "Cerco su Open Food Facts…" : "Cerca anche su Open Food Facts"}
        </button>
      )}
      {offState === "error" && <div className="notice error" role="alert">Open Food Facts non risponde. Riprova tra poco o inserisci i valori a mano.</div>}
      {off && (
        <div style={{ display: "grid", gap: 4 }}>
          <span className="eyebrow">Da Open Food Facts</span>
          {off.length === 0 && <p className="muted" style={{ margin: 0 }}>Nessun prodotto trovato.</p>}
          <ul className="list">
            {off.map(h => (
              <FoodRow key={h.code} food={{ name: h.name, brand: h.brand, variant: h.quantity, source: "off", status: "verified" }}
                onClick={() => pickOff(h)} />
            ))}
          </ul>
          <span className="muted" style={{ fontSize: "0.8rem" }}>Dati di Open Food Facts, licenza ODbL. Scegliendo un prodotto lo aggiungi al catalogo.</span>
        </div>
      )}
      {onAdd && q.trim().length >= 2 && (
        <button className="btn secondary" type="button" onClick={() => onAdd(isBarcode(q.trim()) ? "" : q.trim())}>Non c'è: inserisci a mano</button>
      )}
    </div>
  );
}
