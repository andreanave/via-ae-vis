import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { formatDay, todayIso } from "../../lib/format.js";
import { newId } from "../../lib/trainingOutbox.js";
import { isTrainingDay, planForDay, upcomingDays } from "../../lib/trainingRotation.js";
import { useTrainingData } from "./useTrainingData.js";
import SyncNotice from "./SyncNotice.jsx";
import { ArrowRight, Check, ChevronLeft, ChevronRight } from "lucide-react";

// Allenamento dell'atleta: seduta di oggi, calendario dei prossimi giorni, spostamenti.
export default function TrainingHome() {
  const actor = useActor();
  const navigate = useNavigate();
  const data = useTrainingData(actor.id);
  const [choice, setChoice] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const [overrides, setOverrides] = useState(null);
  const readOnly = actor.assisting;
  const today = todayIso();
  const program = data.program;
  const sessions = program?.sessions || [];
  const ov = overrides || data.overrides || [];

  if (data.loading && !program) return <p className="muted">Caricamento…</p>;
  if (!program) {
    return (
      <section className="page narrow">
        <Link to="/" className="back"><ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />Home</Link>
        <h1>Allenamento</h1>
        <div className="notice">{data.offline ? "Sei offline e la scheda non è ancora salvata su questo telefono." : "Il tuo coach non ha ancora attivato una scheda."}</div>
      </section>
    );
  }

  const plan = planForDay({ day: today, program, sessions, logs: data.workouts, overrides: ov });
  const days = upcomingDays({ from: today, days: 14, program, sessions, logs: data.workouts, overrides: ov });

  const start = (session, status = "in_progress") => {
    const id = newId();
    const now = new Date().toISOString();
    data.outbox.putWorkout({
      id, athlete_id: actor.id, program_id: program.id, session_id: session.id, session_name: session.name,
      performed_on: today, status, notes: "", started_at: now, finished_at: status === "skipped" ? now : null,
    });
    data.sync();
    if (status === "in_progress") navigate(`/allenamento/seduta/${id}`);
    else data.setPending(data.outbox.pendingCount());
  };

  const toggleDay = async day => {
    setCalendarError("");
    const training = isTrainingDay(day, program.training_weekdays, ov);
    const kind = training ? "rest" : "training";
    const planned = program.training_weekdays.includes(new Date(`${day}T12:00:00`).getDay());
    const next = ov.filter(o => o.day !== day);
    const res = (kind === "training") === planned
      ? await supabase.from("schedule_overrides").delete().eq("athlete_id", actor.id).eq("day", day)
      : await supabase.from("schedule_overrides").upsert({ athlete_id: actor.id, day, kind }, { onConflict: "athlete_id,day" });
    if (res.error) { setCalendarError("Per spostare un allenamento serve la connessione."); return; }
    setOverrides((kind === "training") === planned ? next : [...next, { day, kind }]);
  };

  const chosen = sessions.find(s => s.id === choice) || plan.session;

  return (
    <section className="page narrow">
      <Link to="/" className="back"><ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />Home</Link>
      <div className="page-head">
        <span className="eyebrow">{program.name}</span>
        <h1>Allenamento</h1>
      </div>
      <SyncNotice pending={data.pending} offline={data.offline} onSync={() => data.sync().then(data.reload)} />

      <div className="now">
        <span className="eyebrow">Oggi</span>
        {plan.kind === "resume" && (
          <>
            <h2>{plan.workout.session_name} in corso</h2>
            <Link className="btn lg block" to={`/allenamento/seduta/${plan.workout.id}`}>Riprendi la seduta<ArrowRight size={20} strokeWidth={1.5} aria-hidden="true" /></Link>
          </>
        )}
        {plan.kind === "done" && <h2>Seduta completata. Ottimo lavoro.</h2>}
        {plan.kind === "skipped" && (
          <>
            <h2>Oggi salti l'allenamento</h2>
            <p className="muted">{plan.session?.name} slitta al prossimo giorno di allenamento.</p>
          </>
        )}
        {(plan.kind === "training" || plan.kind === "rest") && (
          <>
            <h2>{plan.kind === "training" ? chosen?.name : "Giorno di riposo"}</h2>
            {plan.kind === "rest" && <p className="muted">Se vuoi allenarti comunque, la prossima seduta è {plan.session?.name}.</p>}
            {sessions.length > 1 && !readOnly && (
              <div className="field">
                <label htmlFor="pick-session">Seduta</label>
                <select id="pick-session" className="input" value={chosen?.id || ""} onChange={e => setChoice(e.target.value)}>
                  {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.id === plan.session?.id ? " (prevista)" : ""}</option>)}
                </select>
              </div>
            )}
            {!readOnly && chosen && (
              <>
                <button className="btn lg block" type="button" onClick={() => start(chosen)}>
                  {plan.kind === "training" ? "Inizia la seduta" : "Allenati oggi"}<ArrowRight size={20} strokeWidth={1.5} aria-hidden="true" />
                </button>
                {plan.kind === "training" && (
                  <button className="btn link" type="button" onClick={() => start(chosen, "skipped")}>Salta oggi, la seduta slitta al prossimo allenamento</button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {program.notes && <div className="coach-note"><h2 className="eyebrow">Indicazioni del coach</h2><p className="pre">{program.notes}</p></div>}

      <div className="stack">
        <h2 className="eyebrow">Prossimi giorni</h2>
        <p className="muted hint">Tocca un giorno per renderlo di allenamento o di riposo: le sedute si riorganizzano da sole.</p>
        {calendarError && <div className="notice error" role="alert">{calendarError}</div>}
        <ul className="lines">
          {days.map(d => (
            <li key={d.day} className="day-row">
              <button type="button" disabled={readOnly || d.kind === "done" || d.kind === "skipped"}
                aria-label={`${formatDay(d.day)}: ${d.kind === "rest" ? "riposo" : d.session?.name}. Cambia`}
                onClick={() => toggleDay(d.day)}>
                <span className="day-name">{d.day === today ? "Oggi" : formatDay(d.day)}</span>
                <span className={d.kind === "rest" || d.kind === "skipped" ? "muted" : ""}>
                  {d.kind === "rest" ? "Riposo" : d.kind === "skipped" ? "Saltato" : d.session?.name || "Seduta"}
                </span>
                {d.kind === "done" && <Check size={18} strokeWidth={1.5} aria-label="fatta" />}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <Link to="/allenamento/storico" className="row-link">Le mie sedute<ChevronRight size={20} strokeWidth={1.5} aria-hidden="true" /></Link>
    </section>
  );
}
