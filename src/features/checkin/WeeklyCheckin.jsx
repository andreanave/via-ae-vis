import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { FIELD_BY_KEY } from "../../lib/checkinFields.js";
import { aggregateField, formatNumber, groupEntries, missingRequired, resolveWeeklyValue, weekDays, weekEndFor } from "../../lib/checkinMath.js";
import { formatDay, todayIso } from "../../lib/format.js";
import FieldInput, { parseNumber } from "./FieldInput.jsx";
import { loadEntries, loadSettings, loadWeekly } from "./checkinApi.js";
import WeekComments from "./WeekComments.jsx";

// Resoconto settimanale: propone i valori dai giorni registrati, l'atleta controlla, corregge e conferma.
export default function WeeklyCheckin() {
  const actor = useActor();
  const [params] = useSearchParams();
  const [config, setConfig] = useState(undefined);
  const [weekEnd, setWeekEnd] = useState(null);
  const [entries, setEntries] = useState([]);
  const [weekly, setWeekly] = useState(null);
  const [overrides, setOverrides] = useState({}); // testo digitato per le correzioni
  const [editing, setEditing] = useState({});
  const [answers, setAnswers] = useState({});
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState({});
  const [missing, setMissing] = useState([]);
  const [saveState, setSaveState] = useState("idle");
  const [error, setError] = useState("");
  const timer = useRef(null);
  const fieldRefs = useRef({});

  useEffect(() => {
    let active = true;
    (async () => {
      const cfg = await loadSettings(actor.id);
      if (!active) return;
      if (!cfg) { setConfig(null); return; }
      const end = params.get("settimana") || weekEndFor(todayIso(), cfg.weekday);
      const days = weekDays(end);
      const [rows, w] = await Promise.all([loadEntries(actor.id, days[0], days[6]), loadWeekly(actor.id, end)]);
      if (!active) return;
      setConfig(cfg); setWeekEnd(end); setEntries(rows); setWeekly(w);
      setOverrides(Object.fromEntries(Object.entries(w?.overrides || {}).map(([k, c]) => [k, String(c.v ?? "")])));
      setEditing(Object.fromEntries(Object.keys(w?.overrides || {}).map(k => [k, true])));
      setAnswers(w?.answers || {});
      setNotes(w?.notes || "");
    })();
    return () => { active = false; clearTimeout(timer.current); };
  }, [actor.id, params]);

  const days = weekEnd ? weekDays(weekEnd) : [];
  const byDay = useMemo(() => groupEntries(entries), [entries]);
  const confirmed = weekly?.status === "confirmed";
  const readOnly = actor.assisting || confirmed;

  const parsedOverrides = () => {
    const out = {};
    for (const [key, text] of Object.entries(overrides)) {
      if (!editing[key]) continue;
      const v = parseNumber(text);
      if (v !== "" && !Number.isNaN(v)) out[key] = { v };
    }
    return out;
  };

  const resolved = useMemo(() => {
    if (!config) return {};
    const po = {};
    for (const [key, text] of Object.entries(overrides)) {
      if (!editing[key]) continue;
      const v = parseNumber(text);
      if (v !== "" && !Number.isNaN(v)) po[key] = { v };
    }
    return Object.fromEntries(config.weekly.map(w => {
      const agg = aggregateField(w.key, days, byDay);
      return [w.key, { ...resolveWeeklyValue(agg, po[w.key]), aggregate: agg }];
    }));
  }, [config, overrides, editing, byDay, weekEnd]);

  const payload = status => {
    const base = {
      athlete_id: actor.id, week_end: weekEnd, overrides: parsedOverrides(), answers, notes,
      status, updated_at: new Date().toISOString(),
    };
    if (status === "confirmed") {
      base.confirmed_at = new Date().toISOString();
      base.snapshot = Object.fromEntries(Object.entries(resolved).map(([k, r]) => [k, { value: r.value, origin: r.origin, computed: r.computed, count: r.count }]));
    }
    return base;
  };

  const saveDraft = async () => {
    if (readOnly || !weekEnd) return;
    setSaveState("saving");
    const { data, error: err } = await supabase.from("weekly_checkins")
      .upsert(payload("draft"), { onConflict: "athlete_id,week_end" }).select("*").single();
    if (err) { setSaveState("error"); return; }
    setWeekly(data); setSaveState("saved");
  };
  const scheduleSave = () => { clearTimeout(timer.current); timer.current = setTimeout(saveDraft, 1000); };
  useEffect(() => { if (config && weekEnd && saveState === "dirty") scheduleSave(); }, [overrides, answers, notes, editing]);
  const dirty = () => setSaveState("dirty");

  const confirm = async event => {
    event.preventDefault();
    const miss = missingRequired(config.weekly, resolved, answers);
    setMissing(miss);
    if (miss.length) {
      setError(`Manca ${miss.length === 1 ? "un campo obbligatorio" : `${miss.length} campi obbligatori`}: ${miss.map(k => FIELD_BY_KEY[k].label).join(", ")}.`);
      const first = fieldRefs.current[miss[0]];
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.querySelector("input, textarea, button")?.focus({ preventScroll: true });
      return;
    }
    clearTimeout(timer.current);
    setError("");
    const { data, error: err } = await supabase.from("weekly_checkins")
      .upsert(payload("confirmed"), { onConflict: "athlete_id,week_end" }).select("*").single();
    if (err) { setError("Non riesco a inviare il resoconto. Riprova."); return; }
    setWeekly(data);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (config === undefined) return <p className="muted">Caricamento…</p>;
  if (config === null || config.weekly.length === 0) {
    return <div className="notice">Il tuo coach non ha ancora impostato il check-in settimanale.</div>;
  }

  const describe = (key, r) => {
    const field = FIELD_BY_KEY[key];
    const agg = r.aggregate;
    if (field.type === "text" || field.agg === "none") return null;
    if (agg.count === 0) return "Nessun dato registrato nei giorni: inserisci il valore della settimana.";
    const what = field.agg === "sum" ? "Totale" : "Media";
    const countWord = field.countLabel || (agg.count === 1 ? "giorno" : "giorni");
    return `${what} di ${agg.count} ${field.countLabel ? countWord : countWord}: ${formatNumber(agg.value, field)}${field.unit ? ` ${field.unit}` : ""}`;
  };

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
    <form onSubmit={confirm} noValidate style={{ display: "grid", gap: "1rem" }}>
      <Link to="/" className="muted" style={{ textDecoration: "none" }}>← Home</Link>
      <div>
        <h1 style={{ marginBottom: 4 }}>Check-in settimanale</h1>
        <p className="muted" style={{ margin: 0 }}>
          Dal {formatDay(days[0])} al {formatDay(days[6])}
          {confirmed ? " · Inviato" : saveState === "saving" ? " · Salvataggio…" : saveState === "saved" ? " · Bozza salvata" : ""}
        </p>
      </div>
      {confirmed && <div className="notice" role="status">Resoconto inviato. Il tuo coach lo vede già.</div>}
      {!confirmed && (
        <p className="muted" style={{ margin: 0 }}>
          I valori sono calcolati dai giorni che hai registrato. Controllali, correggili se serve e conferma. I campi con * sono obbligatori.
        </p>
      )}
      {error && <div className="notice error" role="alert">{error}</div>}

      {config.weekly.map(w => {
        const field = FIELD_BY_KEY[w.key];
        const r = resolved[w.key];
        const id = `w-${w.key}`;
        const isMissing = missing.includes(w.key);
        const summary = describe(w.key, r);
        const isText = field.type === "text";
        const showInput = isText || editing[w.key] || r.aggregate.count === 0 || !["avg", "sum"].includes(field.agg);
        return (
          <div key={w.key} ref={el => { fieldRefs.current[w.key] = el; }}
            className={`card field${isMissing ? " invalid" : ""}`}
            style={{ marginBottom: 0, borderColor: isMissing ? "var(--danger)" : undefined }}>
            <label id={`${id}-label`} htmlFor={id}>{field.label}{w.required ? " *" : ""}</label>
            {summary && <span className="muted">{summary}</span>}
            {r.origin === "override" && r.computed !== null && (
              <span className="muted" style={{ fontSize: "0.9rem" }}>
                Nel resoconto: {formatNumber(r.value, field)} {field.unit || ""} (corretto da te; calcolato {formatNumber(r.computed, field)})
              </span>
            )}

            {isText ? (
              <FieldInput field={field} id={id} value={answers[w.key] ?? ""} readOnly={readOnly}
                invalid={isMissing} describedBy={isMissing ? `${id}-err` : undefined}
                onChange={v => { setAnswers({ ...answers, [w.key]: v }); dirty(); }} />
            ) : showInput ? (
              <FieldInput field={field} id={id} readOnly={readOnly}
                value={field.type === "number" ? overrides[w.key] ?? "" : parseNumber(overrides[w.key] ?? "")}
                invalid={isMissing} describedBy={isMissing ? `${id}-err` : undefined}
                onChange={v => { setOverrides({ ...overrides, [w.key]: String(v) }); setEditing({ ...editing, [w.key]: true }); dirty(); }} />
            ) : null}

            {!readOnly && !isText && r.aggregate.count > 0 && ["avg", "sum"].includes(field.agg) && (
              <button type="button" className="btn ghost" style={{ justifySelf: "start" }}
                onClick={() => {
                  if (editing[w.key]) { const o = { ...overrides }; delete o[w.key]; setOverrides(o); setEditing({ ...editing, [w.key]: false }); }
                  else { setOverrides({ ...overrides, [w.key]: String(r.aggregate.value) }); setEditing({ ...editing, [w.key]: true }); }
                  dirty();
                }}>
                {editing[w.key] ? "Usa il valore calcolato" : "Correggi il valore"}
              </button>
            )}

            {r.aggregate.count > 0 && (
              <>
                <button type="button" className="btn ghost" style={{ justifySelf: "start" }} aria-expanded={Boolean(open[w.key])}
                  onClick={() => setOpen({ ...open, [w.key]: !open[w.key] })}>
                  {open[w.key] ? "Nascondi i giorni" : "Vedi i giorni"}
                </button>
                {open[w.key] && (
                  <ul className="list">
                    {days.map(d => {
                      const s = r.aggregate.sources.find(x => x.day === d);
                      return (
                        <li key={d} className="row" style={{ minHeight: 44 }}>
                          <span style={{ flex: 1 }}>{formatDay(d)}</span>
                          <span>{s ? `${isText ? s.value : formatNumber(s.value, field)}${s.source === "health" ? " · Salute" : ""}${s.edited ? " · modificato" : ""}` : "—"}</span>
                          {!readOnly && d <= todayIso() && (
                            <Link to={`/checkin/${field.moments.includes("morning") ? "morning" : "evening"}?giorno=${d}`}>
                              {s ? "Modifica" : "Completa"}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
            {isMissing && <span id={`${id}-err`} className="error">Questo campo è obbligatorio.</span>}
          </div>
        );
      })}

      <div className="card field" style={{ marginBottom: 0 }}>
        <label htmlFor="w-notes">Note per il coach (facoltative)</label>
        <textarea id="w-notes" className="input" rows={4} readOnly={readOnly} style={{ width: "100%", padding: "0.75rem" }}
          value={notes} onChange={e => { setNotes(e.target.value); dirty(); }} />
      </div>

      {!readOnly && <button className="btn block" type="submit">Conferma e invia</button>}
    </form>
    {weekly?.id && <WeekComments weeklyId={weekly.id} athleteId={actor.id} />}
    </div>
  );
}
