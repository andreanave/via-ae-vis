import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useActor } from "../../lib/assist.jsx";
import { FIELD_BY_KEY, MOMENT_LABELS } from "../../lib/checkinFields.js";
import { formatDay, todayIso } from "../../lib/format.js";
import FieldInput, { parseNumber } from "./FieldInput.jsx";
import { loadEntries, loadSettings, saveEntry } from "./checkinApi.js";

const TITLES = { morning: "Check-in del mattino", evening: "Check-out della sera" };

// Check-in giornaliero: tutti i campi sono facoltativi, la bozza si salva da sola.
export default function DailyCheckin() {
  const { moment } = useParams();
  const [params] = useSearchParams();
  const day = params.get("giorno") || todayIso();
  const actor = useActor();
  const navigate = useNavigate();
  const [keys, setKeys] = useState(null);
  const [form, setForm] = useState({});
  const [stored, setStored] = useState({});
  const [status, setStatus] = useState("draft");
  const [saveState, setSaveState] = useState("idle");
  const [errors, setErrors] = useState({});
  const timer = useRef(null);
  const readOnly = actor.assisting;

  useEffect(() => {
    let active = true;
    Promise.all([loadSettings(actor.id), loadEntries(actor.id, day, day)]).then(([cfg, rows]) => {
      if (!active) return;
      setKeys(cfg ? cfg[moment] || [] : []);
      const row = rows.find(r => r.moment === moment);
      const values = row?.values || {};
      setStored(values);
      setStatus(row?.status || "draft");
      setForm(Object.fromEntries(Object.entries(values).map(([k, c]) => [k, c.v ?? ""])));
    }).catch(() => active && setKeys([]));
    return () => { active = false; clearTimeout(timer.current); };
  }, [actor.id, day, moment]);

  // Prepara i valori da salvare; segnala i numeri non validi.
  const build = current => {
    const values = {};
    const nextErrors = {};
    for (const key of keys || []) {
      const field = FIELD_BY_KEY[key];
      const raw = current[key];
      let v = raw;
      if (field.type === "number") {
        v = parseNumber(raw);
        if (Number.isNaN(v) || (v !== "" && (v < field.min || v > field.max))) {
          nextErrors[key] = `Inserisci un numero tra ${field.min} e ${field.max}.`;
          continue;
        }
      }
      if (field.type === "text") v = (raw ?? "").toString();
      if (v === "" || v === undefined || v === null) continue;
      const prev = stored[key];
      const changed = prev && prev.v !== v;
      values[key] = {
        v,
        source: prev?.source || "manual",
        edited: Boolean(prev?.edited || (changed && prev?.source && prev.source !== "manual")),
      };
    }
    return { values, nextErrors };
  };

  const persist = async (current, nextStatus) => {
    const { values, nextErrors } = build(current);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setSaveState("idle"); return false; }
    setSaveState("saving");
    const { error } = await saveEntry(actor.id, day, moment, values, nextStatus);
    if (error) { setSaveState("error"); return false; }
    setStored(values);
    setStatus(nextStatus);
    setSaveState("saved");
    return true;
  };

  const update = (key, value) => {
    const next = { ...form, [key]: value };
    setForm(next);
    setSaveState("idle");
    if (readOnly) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next, status === "done" ? "done" : "draft"), 900);
  };

  const finish = async event => {
    event.preventDefault();
    clearTimeout(timer.current);
    if (await persist(form, "done")) navigate("/");
  };

  if (!["morning", "evening"].includes(moment)) return <p>Pagina non trovata.</p>;
  if (keys === null) return <p className="muted">Caricamento…</p>;

  const isToday = day === todayIso();
  return (
    <form onSubmit={finish} noValidate className="form-page">
      <div>
        <Link to="/" className="back"><ChevronLeft strokeWidth={1.5} aria-hidden="true" />Home</Link>
        <div className="page-head" style={{ marginTop: "0.5rem" }}>
          <span className="eyebrow">
            {isToday ? "Oggi" : formatDay(day)}
            <span role="status">
              {saveState === "saving" ? " · Salvataggio…" : saveState === "saved" ? " · Bozza salvata" : saveState === "error" ? " · Non salvato, riprova" : ""}
            </span>
          </span>
          <h1>{TITLES[moment]}</h1>
          <p className="muted" style={{ margin: 0 }}>Tutti i campi sono facoltativi.</p>
        </div>
      </div>
      {keys.length === 0 && (
        <div className="notice">Il tuo coach non ha ancora scelto cosa chiederti per il {MOMENT_LABELS[moment].toLowerCase()}.</div>
      )}
      {keys.map(key => {
        const field = FIELD_BY_KEY[key];
        const id = `f-${key}`;
        const cell = stored[key];
        return (
          <div key={key} className={`qfield field${errors[key] ? " invalid" : ""}`}>
            <label id={`${id}-label`} htmlFor={id}>{field.label}</label>
            <FieldInput field={field} id={id} value={form[key]} readOnly={readOnly}
              invalid={Boolean(errors[key])} describedBy={errors[key] ? `${id}-err` : undefined}
              onChange={v => update(key, v)} />
            {cell?.source === "health" && (
              <span className="muted hint">Da Salute{cell.edited ? " · modificato a mano" : ""}</span>
            )}
            {errors[key] && <span id={`${id}-err`} className="error">{errors[key]}</span>}
          </div>
        );
      })}
      {keys.length > 0 && !readOnly && (
        <button className="btn lg block" type="submit">
          {status === "done" ? "Salva" : "Ho finito"}
        </button>
      )}
    </form>
  );
}
