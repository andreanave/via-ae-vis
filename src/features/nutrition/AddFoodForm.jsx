import { useEffect, useState } from "react";
import { addFood, searchFoods } from "../../lib/foodApi.js";
import { MACROS, valueProblems } from "../../lib/foodMath.js";
import { rpcErrorMessage } from "../../lib/rpcErrors.js";
import { parseNumber } from "../checkin/FieldInput.jsx";
import FoodValuesForm, { valuesToNumbers } from "./FoodValuesForm.jsx";
import FoodRow from "./FoodRow.jsx";

const num = text => { const v = parseNumber(text); return v === "" || Number.isNaN(v) ? null : v; };

// Nuovo prodotto di marca trascritto dall'etichetta. È subito utilizzabile e resta da verificare per il master.
// Mentre si scrive marca e nome compaiono i prodotti simili già presenti, per evitare doppioni.
const toText = v => (v === null || v === undefined ? "" : String(v).replace(".", ","));

// prefill (facoltativo): dati già letti da Open Food Facts, vedi offToFood().
export default function AddFoodForm({ initialName = "", prefill, onDone, onPick }) {
  const [food, setFood] = useState({
    brand: prefill?.food.brand || "", name: prefill?.food.name || initialName, variant: "", basis: prefill?.food.basis || "g",
    unit_weight_g: "", portion_g: toText(prefill?.food.portion_g), drained_weight_g: "", barcode: prefill?.food.barcode || "",
  });
  const [values, setValues] = useState(() =>
    Object.fromEntries(Object.entries(prefill?.values || {}).map(([k, v]) => [k, toText(v)])));
  const [similar, setSimilar] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setFood(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const q = [food.brand, food.name].join(" ").trim();
    if (q.length < 3) { setSimilar([]); return undefined; }
    const t = setTimeout(() => searchFoods(q, 5).then(setSimilar).catch(() => setSimilar([])), 300);
    return () => clearTimeout(t);
  }, [food.brand, food.name]);

  const submit = async e => {
    e.preventDefault();
    setError("");
    const vals = valuesToNumbers(values);
    if (!food.name.trim()) { setError("Scrivi il nome del prodotto."); return; }
    const missing = MACROS.filter(k => vals[k] === null);
    if (missing.length) { setError("Servono almeno energia, proteine, carboidrati e grassi per 100 " + food.basis + "."); return; }
    if (valueProblems(vals).length) { setError("Controlla i valori segnalati."); return; }
    setSaving(true);
    try {
      const id = await addFood({
        ...food, unit_weight_g: num(food.unit_weight_g), portion_g: num(food.portion_g), drained_weight_g: num(food.drained_weight_g),
        portion_label: prefill?.food.portion_label || null,
      }, {
        ...vals, provenance: "manual",
        ...(prefill ? { kj: prefill.values.kj, polyols_g: prefill.values.polyols_g, ingredients: prefill.ingredients,
          allergens: prefill.allergens, note: prefill.note } : {}),
      });
      onDone?.(id);
    } catch (err) {
      setError(rpcErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const text = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={`af-${k}`}>{label}</label>
      <input id={`af-${k}`} className="input" value={food[k]} onChange={e => set(k, e.target.value)} {...props} />
    </div>
  );

  return (
    <form className="add-food" onSubmit={submit} noValidate>
      {prefill && (
        <div className="notice" style={{ fontSize: "0.9rem" }}>
          Dati letti da Open Food Facts (licenza ODbL). Confrontali con l'etichetta che hai in mano prima di salvare.
          {prefill.missing.length > 0 && " Mancano alcuni valori: completali dall'etichetta."}
          {prefill.imageUrl && <> · <a href={prefill.imageUrl} target="_blank" rel="noreferrer">foto della tabella nutrizionale</a></>}
        </div>
      )}
      {text("brand", "Marca", { autoComplete: "off" })}
      {text("name", "Nome del prodotto", { autoComplete: "off", required: true })}
      {similar.length > 0 && (
        <div className="notice similar">
          <span>Forse è già nel catalogo:</span>
          <ul className="lines">{similar.map(f => <FoodRow key={f.id} food={f} onClick={onPick ? () => onPick(f) : undefined} />)}</ul>
        </div>
      )}
      {text("variant", "Gusto o variante (facoltativo)", { autoComplete: "off" })}
      <div className="field">
        <span className="label">I valori in etichetta sono riferiti a</span>
        <div className="seg" role="group" aria-label="Unità di riferimento">
          {["g", "ml"].map(b => (
            <button key={b} type="button" className="seg-btn num" aria-selected={food.basis === b} aria-pressed={food.basis === b}
              onClick={() => set("basis", b)}>100 {b}</button>
          ))}
        </div>
      </div>
      <FoodValuesForm values={values} onChange={setValues} basis={food.basis} />
      <div className="ex-grid label-grid">
        {text("unit_weight_g", "Peso di un pezzo (g)", { inputMode: "decimal" })}
        {text("portion_g", "Porzione in etichetta (g)", { inputMode: "decimal" })}
        {text("drained_weight_g", "Peso sgocciolato (g)", { inputMode: "decimal" })}
        {text("barcode", "Codice a barre", { inputMode: "numeric" })}
      </div>
      <p className="muted hint">
        Il prodotto si può usare subito. Resterà segnato come da verificare finché non viene controllato.
      </p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="actions">
        <button className="btn" type="submit" disabled={saving}>{saving ? "Salvataggio…" : "Aggiungi al catalogo"}</button>
        {onDone && <button className="btn ghost" type="button" onClick={() => onDone(null)}>Annulla</button>}
      </div>
    </form>
  );
}
