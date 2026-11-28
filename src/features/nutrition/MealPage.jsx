import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";
import { useActor } from "../../lib/assist.jsx";
import { mealTime, timesChosen, weekStart } from "../../lib/dayPlan.js";
import { dayTypeFor, formatQty } from "../../lib/fiber/planDay.js";
import { formatDay, todayIso } from "../../lib/format.js";
import { loadActivePlan } from "./nutritionApi.js";
import { deleteMealLog, loadDayTimes, loadMealLogs, saveMealLog } from "./mealLogApi.js";

const optionLabel = o => o.components.map(c => c.name).join(" + ");
const optionQty = o => o.components.map(formatQty).filter(Boolean).join(" + ");
const WEEKDAY = new Intl.DateTimeFormat("it-IT", { weekday: "long" });

// Un pasto del giorno: alimenti con le alternative del coach, avviso di frequenza, nota e "Ho fatto il pasto".
export default function MealPage() {
  const { mealKey } = useParams();
  const actor = useActor();
  const navigate = useNavigate();
  const today = todayIso();
  const [data, setData] = useState(null);
  const [choices, setChoices] = useState({});
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const [plan, weekLogs, times] = await Promise.all([
        loadActivePlan(actor.id),
        loadMealLogs(actor.id, weekStart(today), today).catch(() => []),
        loadDayTimes(actor.id).catch(() => ({})),
      ]);
      const dayType = plan ? dayTypeFor(plan.content, new Date()) : null;
      const meal = dayType?.meals.find(m => m.key === mealKey) || null;
      const log = weekLogs.find(l => l.day === today && l.kind === "meal" && l.item_key === mealKey) || null;
      if (!active) return;
      setData({ plan, dayType, meal, log, times, others: weekLogs.filter(l => l.kind === "meal" && l !== log) });
      setChoices(log?.choices || {});
      setNote(log?.note || "");
      setShowNote(Boolean(log?.note));
    })().catch(() => active && setData({ plan: null }));
    return () => { active = false; };
  }, [actor.id, mealKey, today]);

  const rules = useMemo(() => new Map((data?.plan?.content.frequencyRules || []).flatMap(r => r.appliesTo.map(k => [k, r.maxPerWeek]))), [data]);

  if (!data) return <p className="muted">Caricamento…</p>;
  if (!data.meal) {
    return (
      <section className="stack" style={{ maxWidth: 560, margin: "0 auto" }}>
        <Link to="/" className="back"><ChevronLeft strokeWidth={1.5} aria-hidden="true" />Oggi</Link>
        <p className="muted">Questo pasto non è nel piano di oggi.</p>
      </section>
    );
  }
  const { meal, dayType, log } = data;
  const chosen = g => g.options.find(o => o.key === choices[g.key]) || g.options[0];
  const warning = option => {
    const limit = option.maxPerWeek || rules.get(option.key);
    if (!limit) return null;
    const days = timesChosen(option.key, data.others);
    if (days.length < limit) return `Consigliato al massimo ${limit} ${limit === 1 ? "volta" : "volte"} a settimana.`;
    const when = days.map(d => WEEKDAY.format(new Date(`${d}T12:00:00`))).join(", ");
    return `Già scelto ${when}. Consigliato al massimo ${limit} ${limit === 1 ? "volta" : "volte"} a settimana.`;
  };

  const save = async status => {
    if (actor.assisting) return;
    setBusy(true); setError("");
    try {
      const names = meal.groups.map(g => optionLabel(chosen(g)));
      const saved = await saveMealLog({ athleteId: actor.id, day: today, key: meal.key, name: meal.name, planId: data.plan.id,
        status, choices, choiceNames: names, note });
      setData({ ...data, log: saved });
      if (status === "done" || status === "skipped") navigate("/");
    } catch { setError("Non sono riuscito a salvare. Controlla la connessione e riprova."); }
    setBusy(false);
  };
  const undo = async () => {
    setBusy(true);
    try { await deleteMealLog(log.id); setData({ ...data, log: null }); } catch { setError("Non sono riuscito ad annullare."); }
    setBusy(false);
  };

  const p = meal.printed || {};
  return (
    <section className="stack" style={{ maxWidth: 560, margin: "0 auto", gap: "1.5rem" }}>
      <Link to="/" className="back"><ChevronLeft strokeWidth={1.5} aria-hidden="true" />Oggi</Link>
      <div className="page-head">
        <span className="eyebrow">Giorno {dayType.key} · {mealTime(meal, data.times)}</span>
        <h1>{meal.name}</h1>
      </div>
      <div className="day-macros">
        {[["carbs", "carbo g"], ["protein", "prot g"], ["fat", "grassi g"], ["kcal", "kcal"]].map(([k, l]) => (
          <div key={k}><span className="num">{p[k] ?? "—"}</span><small>{l}</small></div>
        ))}
      </div>

      {log && (
        <div className={`notice ${log.status === "done" ? "success" : "warning"}`} role="status">
          {log.status === "done" ? "Pasto registrato" : "Pasto segnato come saltato"} il {formatDay(log.day)} alle{" "}
          {new Date(log.updated_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}.{" "}
          <button type="button" className="btn link" onClick={undo} disabled={busy || actor.assisting}>Annulla</button>
        </div>
      )}
      {error && <div className="notice error" role="alert">{error}</div>}

      <section aria-label="Alimenti" style={{ borderBottom: "1px solid var(--border)" }}>
        {meal.groups.map(g => {
          const current = chosen(g);
          const hasAlts = g.options.length > 1;
          const isOpen = open === g.key;
          return (
            <div key={g.key} className="meal-group">
              <button type="button" aria-expanded={hasAlts ? isOpen : undefined} disabled={!hasAlts}
                onClick={() => setOpen(isOpen ? null : g.key)} style={{ cursor: hasAlts ? "pointer" : "default" }}>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: isOpen ? 600 : 400 }}>{optionLabel(current)}</span>
                  {hasAlts && !isOpen && <span className="muted" style={{ fontSize: "0.82rem" }}> · {g.options.length - 1} {g.options.length === 2 ? "alternativa" : "alternative"}</span>}
                  {current.notes?.[0] && <small className="muted" style={{ display: "block", fontSize: "0.8rem" }}>{current.notes[0]}</small>}
                </span>
                <span className="qty">{optionQty(current)}</span>
                {hasAlts && (isOpen ? <ChevronUp size={18} strokeWidth={1.5} aria-hidden="true" /> : <ChevronDown size={18} strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" />)}
              </button>
              {isOpen && (
                <div className="meal-alts" role="group" aria-label={`Alternative a ${optionLabel(g.options[0])}`}>
                  {g.options.map(o => {
                    const warn = warning(o);
                    const selected = o.key === current.key;
                    return (
                      <button key={o.key} type="button" aria-pressed={selected}
                        onClick={() => { setChoices({ ...choices, [g.key]: o.key }); setOpen(null); }}>
                        <span className="line">
                          <span>{selected && <Check size={14} strokeWidth={2} aria-hidden="true" style={{ marginRight: 6 }} />}{optionLabel(o)}</span>
                          <span className="qty">{optionQty(o)}</span>
                        </span>
                        {warn && <span className="freq-warn">{warn}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>
      <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
        Le alternative sono quelle indicate dal tuo professionista e valgono come scambio alla pari. Tocca un alimento per vederle.
      </p>

      {showNote && (
        <div className="field">
          <label htmlFor="meal-note">Nota per il coach</label>
          <textarea id="meal-note" className="input" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Es. oggi ero fuori, a pranzo bistecca e patate al forno" />
          <button type="button" className="btn link" style={{ justifySelf: "start" }} disabled={busy || actor.assisting}
            onClick={() => save("skipped")}>Ho saltato questo pasto</button>
        </div>
      )}

      {!actor.assisting && (
        <div className="sticky-actions">
          {!showNote && <button type="button" className="btn secondary" onClick={() => setShowNote(true)}>Nota</button>}
          <button type="button" className="btn lg" style={{ flex: 1 }} disabled={busy} onClick={() => save("done")}>
            {log?.status === "done" ? "Aggiorna il pasto" : "Ho fatto il pasto"}
          </button>
        </div>
      )}
    </section>
  );
}
