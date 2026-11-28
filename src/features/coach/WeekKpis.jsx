import { useEffect, useState } from "react";
import { FIELD_BY_KEY } from "../../lib/checkinFields.js";
import { addDays, aggregateField, formatNumber, groupEntries, resolveWeeklyValue, weekDays, weekEndFor } from "../../lib/checkinMath.js";
import { formatDay, todayIso } from "../../lib/format.js";
import { loadEntries, loadSettings, loadWeekly } from "../checkin/checkinApi.js";

const KEYS = ["weight", "steps", "workouts_done", "diet_adherence"];
const LABELS = { weight: "Peso medio", steps: "Passi", workouts_done: "Sedute", diet_adherence: "Aderenza dieta" };

// Valori della settimana: dal resoconto confermato se c'è, altrimenti calcolati dai giorni registrati.
const weekValues = (weekly, entries, days) => {
  const byDay = groupEntries(entries);
  return Object.fromEntries(KEYS.map(key => {
    const snap = weekly?.status === "confirmed" ? weekly.snapshot?.[key] : null;
    if (snap) return [key, { value: snap.value, count: snap.count }];
    const agg = aggregateField(key, days, byDay);
    const r = resolveWeeklyValue(agg, weekly?.overrides?.[key]);
    return [key, { value: r.value ?? null, count: agg.count }];
  }));
};

// Scheda "Settimana" della Panoramica (design): stato del resoconto e quattro numeri grandi.
export default function WeekKpis({ athleteId, onOpen }) {
  const [state, setState] = useState(undefined);

  useEffect(() => {
    let active = true;
    (async () => {
      const cfg = await loadSettings(athleteId);
      const end = weekEndFor(todayIso(), cfg?.weekday ?? 0);
      const prevEnd = addDays(end, -7);
      const days = weekDays(end);
      const prevDays = weekDays(prevEnd);
      const [rows, weekly, prevWeekly] = await Promise.all([
        loadEntries(athleteId, prevDays[0], days[6]), loadWeekly(athleteId, end), loadWeekly(athleteId, prevEnd),
      ]);
      if (!active) return;
      const inWeek = d => r => r.day >= d[0] && r.day <= d[6];
      setState({
        days, weekly,
        now: weekValues(weekly, rows.filter(inWeek(days)), days),
        before: weekValues(prevWeekly, rows.filter(inWeek(prevDays)), prevDays),
      });
    })().catch(() => active && setState(null));
    return () => { active = false; };
  }, [athleteId]);

  if (state === undefined) return <div className="card week-kpis"><p className="muted" style={{ margin: 0 }}>Caricamento della settimana…</p></div>;
  if (state === null) return null;
  const { days, weekly, now, before } = state;
  const status = weekly?.status === "confirmed" ? ["ok", "Confermato dall'atleta"]
    : weekly?.status === "draft" ? ["wait", "In attesa di conferma"]
    : ["none", "Non ancora iniziato"];

  const sub = key => {
    const v = now[key];
    if (v.value == null) return "non ancora";
    if (key === "weight" && before.weight.value != null) {
      const d = v.value - before.weight.value;
      const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
      return `${sign}${formatNumber(Math.abs(d), FIELD_BY_KEY.weight)} kg · ${v.count} ${v.count === 1 ? "pesata" : "pesate"}`;
    }
    if (key === "workouts_done") return "nella settimana";
    // Voto da 0 a 10: nel resoconto settimanale lo dà l'atleta, senza giorni da contare.
    if (key === "diet_adherence") return v.count ? `su 10 · media di ${v.count} ${v.count === 1 ? "giorno" : "giorni"}` : "su 10";
    return `su ${v.count} ${v.count === 1 ? "giorno" : "giorni"}`;
  };
  const value = key => (now[key].value == null ? "—" : formatNumber(now[key].value, FIELD_BY_KEY[key]));
  const trend = before.weight.value != null && now.weight.value != null ? Math.sign(now.weight.value - before.weight.value) : 0;

  return (
    <section className="card week-kpis" aria-labelledby="week-kpis-title">
      <div className="week-kpis-head">
        <h2 id="week-kpis-title">Settimana {formatDay(days[0])} – {formatDay(days[6])}</h2>
        <span className={`status-dot ${status[0]}`}>{status[1]}</span>
      </div>
      <dl className="week-kpis-grid">
        {KEYS.map(key => (
          <div key={key}>
            <dt>{LABELS[key]}</dt>
            <dd className="num">{value(key)}</dd>
            <dd className={`num sub${key === "weight" && trend < 0 ? " down" : ""}`}>{sub(key)}</dd>
          </div>
        ))}
      </dl>
      {onOpen && <button type="button" className="btn link" onClick={onOpen}>Vedi tutti i check-in</button>}
    </section>
  );
}
