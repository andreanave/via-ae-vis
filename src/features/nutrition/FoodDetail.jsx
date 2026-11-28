import { Fragment, useEffect, useState } from "react";
import { foodVersions, getFood } from "../../lib/foodApi.js";
import { NUTRIENTS, formatAmount } from "../../lib/foodMath.js";
import { FOOD_SOURCES, FOOD_STATES, FOOD_STATUS } from "../../lib/foodSources.js";
import { labelPhotoUrl } from "../../lib/labelPhoto.js";

// Foto dell'etichetta della versione: si scarica solo quando la si apre (link firmato, valido pochi minuti).
function LabelPhoto({ path }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => { setUrl(""); setError(false); }, [path]);
  if (url) return <img className="label-thumb" src={url} alt="Foto dell'etichetta" />;
  return (
    <>
      <button className="btn link" type="button" onClick={() => labelPhotoUrl(path).then(setUrl).catch(() => setError(true))}>
        Vedi la foto dell'etichetta
      </button>
      {error && <span className="error">Non riesco ad aprire la foto.</span>}
    </>
  );
}

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
    <article className="food-detail">
      <header className="page-head">
        {food.brand && <div className="eyebrow">{food.brand}</div>}
        <h2>{food.name}{food.variant ? ` · ${food.variant}` : ""}</h2>
        <div className="muted hint">
          {FOOD_STATUS[food.status]}{food.creator?.full_name ? ` · inserito da ${food.creator.full_name}` : ""}
        </div>
      </header>
      <table className="data-table compact">
        <caption className="muted">Valori per 100 {food.basis}</caption>
        <tbody>
          {NUTRIENTS.map(({ key, label, unit, sub }) => (
            <tr key={key} className={sub ? "sub" : undefined}>
              <th scope="row">{label}</th>
              <td className="n">
                {v.unreadable?.includes(key) ? "illeggibile" : `${formatAmount(v[key])} ${v[key] === null || v[key] === undefined ? "" : unit}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {v.label_photo_path && <LabelPhoto path={v.label_photo_path} />}
      {v.is_estimate && <div className="notice warning">Valori stimati: {v.estimate_note}</div>}
      {facts.length > 0 && (
        <dl className="facts">
          {facts.map(([k, val]) => <Fragment key={k}><dt className="muted">{k}</dt><dd>{val}</dd></Fragment>)}
        </dl>
      )}
      <p className="muted hint source">
        Fonte: {src.citation || src.label || food.source}{food.source_ref ? `, codice ${food.source_ref}` : ""}
        {src.url && <> · <a href={src.url} target="_blank" rel="noreferrer">{src.url.replace(/^https?:\/\//, "")}</a></>}
        {v.provenance === "manual" && " · valori trascritti a mano"}
        {v.provenance === "label" && " · valori dalla foto dell'etichetta"}
      </p>
      {versions.length > 1 && (
        <details>
          <summary>Etichette precedenti ({versions.length - 1})</summary>
          <ul className="lines">
            {versions.slice(1).map(old => (
              <li key={old.id} className="num hint">
                v{old.version} · {new Date(old.created_at).toLocaleDateString("it-IT")} · {formatAmount(old.kcal, 0)} kcal ·
                P {formatAmount(old.protein_g)} · C {formatAmount(old.carbs_g)} · G {formatAmount(old.fat_g)}
              </li>
            ))}
          </ul>
          <p className="muted hint">I pasti registrati conservano i valori dell'etichetta in uso quel giorno.</p>
        </details>
      )}
      {children}
    </article>
  );
}
