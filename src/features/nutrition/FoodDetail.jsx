import { Fragment, useEffect, useState } from "react";
import { foodVersions, getFood } from "../../lib/foodApi.js";
import { NUTRIENTS, formatAmount } from "../../lib/foodMath.js";
import { FOOD_SOURCES, FOOD_STATES, FOOD_STATUS } from "../../lib/foodSources.js";

// Scheda di una voce: valori per 100 g/ml della versione corrente, fonte con citazione, storico delle etichette.
export default function FoodDetail({ id, reloadKey, children }) {
  const [food, setFood] = useState(null);
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setFood(null);
    Promise.all([getFood(id), foodVersions(id)])
      .then(([f, v]) => { setFood(f); setVersions(v); })
      .catch(() => setError("Non riesco a caricare questa voce."));
  }, [id, reloadKey]);

  if (error) return <div className="notice error" role="alert">{error}</div>;
  if (!food) return <p className="muted">Caricamento…</p>;
  const v = food.current || {};
  const src = FOOD_SOURCES[food.source] || {};
  const facts = [
    food.state && ["Stato", FOOD_STATES[food.state]],
    food.edible_part_pct && food.edible_part_pct < 100 && ["Parte edibile", `${formatAmount(food.edible_part_pct, 0)} %`],
    food.portion_g && ["Porzione", `${formatAmount(food.portion_g, 0)} g${food.portion_label ? ` (${food.portion_label})` : ""}`],
    food.unit_weight_g && ["Peso di un pezzo", `${formatAmount(food.unit_weight_g)} g`],
    food.drained_weight_g && ["Peso sgocciolato", `${formatAmount(food.drained_weight_g)} g`],
    food.barcode && ["Codice a barre", food.barcode],
  ].filter(Boolean);

  return (
    <article style={{ display: "grid", gap: "1rem" }}>
      <header>
        {food.brand && <div className="eyebrow">{food.brand}</div>}
        <h2 style={{ margin: 0 }}>{food.name}{food.variant ? ` · ${food.variant}` : ""}</h2>
        <div className="muted" style={{ fontSize: "0.9rem" }}>
          {FOOD_STATUS[food.status]}{food.creator?.full_name ? ` · inserito da ${food.creator.full_name}` : ""}
        </div>
      </header>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <caption className="muted" style={{ textAlign: "left", fontSize: "0.85rem", paddingBottom: 4 }}>Valori per 100 {food.basis}</caption>
        <tbody>
          {NUTRIENTS.map(({ key, label, unit, sub }) => (
            <tr key={key} style={{ borderTop: "1px solid var(--border)" }}>
              <th scope="row" style={{ textAlign: "left", fontWeight: sub ? 400 : 500, padding: "0.4rem 0", paddingLeft: sub ? 16 : 0 }}>{label}</th>
              <td className="num" style={{ textAlign: "right" }}>
                {v.unreadable?.includes(key) ? "illeggibile" : `${formatAmount(v[key])} ${v[key] === null || v[key] === undefined ? "" : unit}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {v.is_estimate && <div className="notice warning">Valori stimati: {v.estimate_note}</div>}
      {facts.length > 0 && (
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.25rem 1rem", margin: 0 }}>
          {facts.map(([k, val]) => <Fragment key={k}><dt className="muted">{k}</dt><dd style={{ margin: 0 }}>{val}</dd></Fragment>)}
        </dl>
      )}
      <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
        Fonte: {src.citation || src.label || food.source}{food.source_ref ? `, codice ${food.source_ref}` : ""}
        {src.url && <> · <a href={src.url} target="_blank" rel="noreferrer">{src.url.replace(/^https?:\/\//, "")}</a></>}
        {v.provenance === "manual" && " · valori trascritti a mano"}
      </p>
      {versions.length > 1 && (
        <details>
          <summary>Etichette precedenti ({versions.length - 1})</summary>
          <ul className="list">
            {versions.slice(1).map(old => (
              <li key={old.id} className="row num" style={{ fontSize: "0.85rem" }}>
                v{old.version} · {new Date(old.created_at).toLocaleDateString("it-IT")} · {formatAmount(old.kcal, 0)} kcal ·
                P {formatAmount(old.protein_g)} · C {formatAmount(old.carbs_g)} · G {formatAmount(old.fat_g)}
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: "0.85rem" }}>I pasti registrati conservano i valori dell'etichetta in uso quel giorno.</p>
        </details>
      )}
      {children}
    </article>
  );
}
