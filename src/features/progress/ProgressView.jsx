import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { addDays } from "../../lib/checkinMath.js";
import { todayIso } from "../../lib/format.js";
import { dailyPoints, liftProgress, progressText, weeklySeries, workoutsPerWeek } from "../../lib/progress.js";
import { loadEntries, loadSettings } from "../checkin/checkinApi.js";
import { BarChart, LineChart, Sparkline } from "./Charts.jsx";

const WEEKS = 8;
const int = n => Math.round(n).toLocaleString("it-IT", { useGrouping: "always" });
const fmt = (n, d = 1) => (n === null || n === undefined ? "—" : n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d }));

// Andamento di un atleta: numeri della settimana, grafici e testo informativo.
// canEdit: il professionista può riscrivere il testo che l'atleta vede.
export default function ProgressView({ athleteId, canEdit = false, actorId }) {
  const [data, setData] = useState(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const today = todayIso();
      const from = addDays(today, -7 * WEEKS - 7);
      const [config, entries, workouts, note] = await Promise.all([
        loadSettings(athleteId).catch(() => null),
        loadEntries(athleteId, from, today).catch(() => []),
        supabase.from("workout_logs").select("id, performed_on, status").eq("athlete_id", athleteId).gte("performed_on", from).then(r => r.data || []),
        supabase.from("progress_notes").select("body, updated_at").eq("athlete_id", athleteId).maybeSingle().then(r => r.data),
      ]);
      const ids = workouts.filter(w => w.status === "done").map(w => w.id);
      const sets = ids.length ? (await supabase.from("set_logs").select("workout_id, exercise_name, load").in("workout_id", ids)).data || [] : [];
      if (!active) return;
      setData({ today, weekday: config?.weekday ?? 0, entries, workouts, sets, note });
      setText(note?.body || "");
    })();
    return () => { active = false; };
  }, [athleteId]);

  const view = useMemo(() => {
    if (!data) return null;
    const opts = { today: data.today, weekday: data.weekday, weeks: WEEKS };
    const weight = weeklySeries(data.entries, "weight", opts);
    const steps = weeklySeries(data.entries, "steps", opts);
    const sleep = weeklySeries(data.entries, "sleep_hours", opts);
    const workouts = workoutsPerWeek(data.workouts, opts);
    const lifts = liftProgress(data.sets, data.workouts);
    return { weight, steps, sleep, workouts, lifts, auto: progressText({ weight, steps, sleep, workouts, lifts }) };
  }, [data]);

  if (!view) return <p className="muted">Caricamento…</p>;
  const empty = !data.entries.length && !data.workouts.length;
  if (empty) return <p className="muted">Ancora nessun dato: l'andamento si riempie con i check-in e le sedute registrate.</p>;

  const lastW = view.weight.filter(p => p.value !== null);
  const wNow = lastW.at(-1), wPrev = lastW.at(-2);
  const wDiff = wNow && wPrev ? Math.round((wNow.value - wPrev.value) * 10) / 10 : null;
  const lastSteps = view.steps.filter(p => p.value !== null).at(-1);
  const lastSleep = view.sleep.filter(p => p.value !== null).at(-1);
  const wk = view.workouts.at(-1);
  const shown = data.note?.body || view.auto;
  const pts = s => s.map(p => ({ x: p.weekEnd, value: p.value === null ? null : Number(p.value.toFixed(2)), count: p.count }));

  const saveText = async () => {
    setSaveState("saving");
    const { error } = await supabase.from("progress_notes").upsert({ athlete_id: athleteId, body: text.trim(), updated_by: actorId, updated_at: new Date().toISOString() });
    if (error) { setSaveState("error"); return; }
    setData({ ...data, note: { body: text.trim(), updated_at: new Date().toISOString() } });
    setEditing(false); setSaveState("");
  };

  return (
    <div className="stack" style={{ gap: "2rem" }}>
      <section className="card" aria-label="Questa settimana">
        <div className="stat-grid">
          <div><span className="muted" style={{ fontSize: "0.85rem" }}>Peso medio</span>
            <span className="num-lg">{fmt(wNow?.value)}</span>
            <span className={`delta${wDiff < 0 ? " good" : ""}`}>
              {wDiff === null ? (wNow ? `${wNow.count} pesate` : "kg")
                : wDiff === 0 ? "stabile sulla settimana" : `${wDiff > 0 ? "+" : "−"}${fmt(Math.abs(wDiff))} kg sulla settimana`}
            </span></div>
          <div><span className="muted" style={{ fontSize: "0.85rem" }}>Passi</span>
            <span className="num-lg">{lastSteps ? int(lastSteps.value) : "—"}</span>
            <span className="delta">{lastSteps ? `media su ${lastSteps.count} giorni` : ""}</span></div>
          <div><span className="muted" style={{ fontSize: "0.85rem" }}>Sonno</span>
            <span className="num-lg">{fmt(lastSleep?.value)}</span>
            <span className="delta">{lastSleep ? "ore a notte" : ""}</span></div>
          <div><span className="muted" style={{ fontSize: "0.85rem" }}>Sedute</span>
            <span className="num-lg">{wk.done}</span>
            <span className="delta">{wk.skipped ? `${wk.skipped} ${wk.skipped === 1 ? "saltata" : "saltate"}` : "questa settimana"}</span></div>
        </div>
      </section>

      <section aria-label="In breve">
        <h2 className="eyebrow" style={{ margin: "0 0 0.5rem" }}>In breve</h2>
        {editing ? (
          <div className="field">
            <label htmlFor="progress-text">Testo che vede l'atleta</label>
            <textarea id="progress-text" className="input" rows={4} maxLength={2000} value={text} onChange={e => setText(e.target.value)} />
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={saveText} disabled={saveState === "saving"}>Salva</button>
              <button type="button" className="btn ghost" onClick={() => { setText(view.auto); }}>Usa il testo automatico</button>
              <button type="button" className="btn ghost" onClick={() => { setEditing(false); setText(data.note?.body || ""); }}>Annulla</button>
            </div>
            {saveState === "error" && <div className="notice error" role="alert">Non sono riuscito a salvare.</div>}
          </div>
        ) : (
          <>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{shown || "Pochi dati per un riepilogo."}</p>
            <p className="muted" style={{ fontSize: "0.8rem", margin: "0.4rem 0 0" }}>
              {data.note?.body ? "Scritto dal tuo professionista." : "Calcolato dai dati registrati."}
              {canEdit && <> <button type="button" className="btn link" onClick={() => { setText(shown); setEditing(true); }}>Modifica il testo per l'atleta</button></>}
            </p>
          </>
        )}
      </section>

      <div className="chart-grid">
      <section aria-label="Peso">
        <h2 className="eyebrow" style={{ margin: "0 0 0.5rem" }}>Peso medio settimanale (kg)</h2>
        <LineChart label="Peso medio settimanale" unit="kg" points={pts(view.weight)} raw={dailyPoints(data.entries, "weight").map(p => ({ x: p.day, value: p.value }))} />
      </section>
      <section aria-label="Passi">
        <h2 className="eyebrow" style={{ margin: "0 0 0.5rem" }}>Passi, media giornaliera</h2>
        <LineChart label="Passi medi" decimals={0} points={pts(view.steps)} />
      </section>
      <section aria-label="Sonno">
        <h2 className="eyebrow" style={{ margin: "0 0 0.5rem" }}>Ore di sonno, media</h2>
        <LineChart label="Ore di sonno" unit="h" points={pts(view.sleep)} />
      </section>
      <section aria-label="Sedute">
        <h2 className="eyebrow" style={{ margin: "0 0 0.5rem" }}>Sedute fatte per settimana</h2>
        <BarChart label="Sedute per settimana" bars={view.workouts.map(w => ({ x: w.weekEnd, value: w.done, note: w.skipped ? `${w.skipped} saltate` : "" }))} />
      </section>
      </div>
      {view.lifts.length > 0 && (
        <section aria-label="Carichi">
          <h2 className="eyebrow" style={{ margin: "0 0 0.5rem" }}>Carichi, serie migliore per seduta</h2>
          <ul className="lines">
            {view.lifts.map(l => (
              <li key={l.name} className="lift-row">
                <span className="name">{l.name}</span>
                <span className="spark"><Sparkline points={l.points} label={`${l.name} da ${l.first} a ${l.last} kg`} /></span>
                <span className="num" style={{ minWidth: "6.5rem", textAlign: "right" }}>{fmt(l.first, l.first % 1 ? 1 : 0)} → {fmt(l.last, l.last % 1 ? 1 : 0)} kg</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
