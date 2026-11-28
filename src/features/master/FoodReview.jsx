import { useEffect, useState } from "react";
import { addFoodVersion, foodsToReview, mergeFood, verifyFood } from "../../lib/foodApi.js";
import { NUTRIENTS } from "../../lib/foodMath.js";
import { rpcErrorMessage } from "../../lib/rpcErrors.js";
import FoodRow from "../nutrition/FoodRow.jsx";
import FoodDetail from "../nutrition/FoodDetail.jsx";
import FoodSearch from "../nutrition/FoodSearch.jsx";
import FoodValuesForm, { valuesToNumbers } from "../nutrition/FoodValuesForm.jsx";

// Console del master: voci del catalogo da verificare. Si possono correggere (nuova versione dei valori),
// confermare o ricondurre a una voce già presente.
export default function FoodReview() {
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState(null); // "edit" | "merge"
  const [values, setValues] = useState({});
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState("");

  const load = () => foodsToReview().then(setItems).catch(() => setError("Non riesco a caricare le voci da verificare."));
  useEffect(() => { load(); }, []);
  const item = items?.find(f => f.id === selected);

  const run = async fn => {
    setError("");
    try { await fn(); setMode(null); setReloadKey(k => k + 1); await load(); }
    catch (err) { setError(rpcErrorMessage(err)); }
  };
  const startEdit = () => {
    const cur = item?.current || {};
    setValues(Object.fromEntries(NUTRIENTS.map(({ key }) => [key, cur[key] === null || cur[key] === undefined ? "" : String(cur[key]).replace(".", ",")])));
    setMode("edit");
  };
  const saveEdit = () => run(() => addFoodVersion(selected, { ...valuesToNumbers(values), provenance: "manual", note: "Corretto dal master" }));
  const verify = () => run(async () => { await verifyFood(selected); setSelected(null); });
  const merge = target => run(async () => { await mergeFood(selected, target.id); setSelected(null); });

  return (
    <section className="stack master-section">
      <div className="section-head">
        <h2>Catalogo da verificare</h2>
        {items && <span className="muted num">{items.length}</span>}
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {items?.length === 0 && <p className="muted">Nessuna voce da controllare.</p>}
      <div className="split">
        {items?.length > 0 && (
          <ul className="lines">
            {items.map(f => (
              <FoodRow key={f.id} active={f.id === selected}
                food={{ ...f, kcal: f.current?.kcal, protein_g: f.current?.protein_g, carbs_g: f.current?.carbs_g, fat_g: f.current?.fat_g }}
                onClick={() => { setSelected(f.id); setMode(null); }} />
            ))}
          </ul>
        )}
        {item && (
          <div className="editor-card split-detail">
            <FoodDetail id={item.id} reloadKey={reloadKey}>
              {mode === null && (
                <div className="actions">
                  <button className="btn" type="button" onClick={verify}>Confermo i valori</button>
                  <button className="btn ghost" type="button" onClick={startEdit}>Correggi</button>
                  <button className="btn ghost" type="button" onClick={() => setMode("merge")}>È un doppione</button>
                </div>
              )}
              {mode === "edit" && (
                <div className="stack">
                  <FoodValuesForm values={values} onChange={setValues} basis={item.basis} />
                  <p className="muted hint">La correzione vale per gli utilizzi successivi; i pasti già registrati restano invariati.</p>
                  <div className="actions">
                    <button className="btn" type="button" onClick={saveEdit}>Salva correzione</button>
                    <button className="btn ghost" type="button" onClick={() => setMode(null)}>Annulla</button>
                  </div>
                </div>
              )}
              {mode === "merge" && (
                <div className="stack">
                  <p>Scegli la voce principale a cui ricondurre questo prodotto.</p>
                  <FoodSearch autoFocus onPick={f => f.id !== item.id && merge(f)} />
                  <button className="btn ghost" type="button" onClick={() => setMode(null)}>Annulla</button>
                </div>
              )}
            </FoodDetail>
          </div>
        )}
      </div>
    </section>
  );
}
