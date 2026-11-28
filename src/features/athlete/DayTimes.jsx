import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useActor } from "../../lib/assist.jsx";
import { CHECKIN_TIMES, DEFAULT_TRAINING_TIME, mealTime, mealTimeKey } from "../../lib/dayPlan.js";
import { dayTypeFor } from "../../lib/fiber/planDay.js";
import { loadActivePlan } from "../nutrition/nutritionApi.js";
import { loadDayTimes, saveDayTimes } from "../nutrition/mealLogApi.js";

// Fasce orarie dell'atleta: decidono l'ordine della giornata e cosa compare in "Adesso".
export default function DayTimes() {
  const actor = useActor();
  const [rows, setRows] = useState(null);
  const [times, setTimes] = useState({});
  const [state, setState] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([loadActivePlan(actor.id).catch(() => null), loadDayTimes(actor.id)]).then(([plan, saved]) => {
      if (!active) return;
      const meals = new Map();
      // Un orario per nome di pasto, nell'ordine della giornata di oggi e poi degli altri tipi di giorno.
      const today = plan ? dayTypeFor(plan.content) : null;
      const all = [...(today?.meals || []), ...(plan?.content.dayTypes || []).flatMap(d => d.meals)];
      for (const m of all) if (!/intra/i.test(m.name) && !meals.has(mealTimeKey(m))) meals.set(mealTimeKey(m), m);
      setRows([
        { key: "checkin:morning", label: "Check-in del mattino", def: CHECKIN_TIMES.morning },
        ...[...meals.values()].sort((a, b) => mealTime(a, {}).localeCompare(mealTime(b, {})))
          .map(m => ({ key: mealTimeKey(m), label: m.name, def: mealTime(m, {}) })),
        { key: "training", label: "Allenamento", def: DEFAULT_TRAINING_TIME },
        { key: "checkin:evening", label: "Check-out serale", def: CHECKIN_TIMES.evening },
      ]);
      setTimes(saved);
    });
    return () => { active = false; };
  }, [actor.id]);

  const save = async () => {
    setState("saving");
    const clean = Object.fromEntries(Object.entries(times).filter(([, v]) => /^\d{2}:\d{2}$/.test(v)));
    try { await saveDayTimes(actor.id, clean); setState("saved"); } catch { setState("error"); }
  };

  return (
    <section className="stack" style={{ maxWidth: 560, margin: "0 auto", gap: "1.5rem" }}>
      <Link to="/" className="back"><ChevronLeft strokeWidth={1.5} aria-hidden="true" />Oggi</Link>
      <div className="page-head">
        <span className="eyebrow">Impostazioni</span>
        <h1>Orari della giornata</h1>
        <p className="muted">Servono a mettere in ordine la tua giornata e a proporti la cosa giusta al momento giusto. Puoi sempre aprire qualunque attività quando vuoi.</p>
      </div>
      {!rows ? <p className="muted">Caricamento…</p> : (
        <ul className="lines">
          {rows.map(r => (
            <li key={r.key}>
              <label htmlFor={r.key} style={{ flex: 1 }}>{r.label}</label>
              <input id={r.key} type="time" className="input num" style={{ width: "8rem" }} disabled={actor.assisting}
                value={times[r.key] || r.def} onChange={e => { setTimes({ ...times, [r.key]: e.target.value }); setState(""); }} />
            </li>
          ))}
        </ul>
      )}
      {!actor.assisting && (
        <button type="button" className="btn lg block" onClick={save} disabled={state === "saving"}>
          {state === "saving" ? "Salvo…" : "Salva gli orari"}
        </button>
      )}
      {state === "saved" && <div className="notice success" role="status">Orari salvati.</div>}
      {state === "error" && <div className="notice error" role="alert">Non sono riuscito a salvare. Riprova.</div>}
    </section>
  );
}
