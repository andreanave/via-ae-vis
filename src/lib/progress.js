// Andamento dell'atleta: serie settimanali da check-in e sedute, e un breve testo informativo.
import { addDays, weekEndFor } from "./checkinMath.js";

const value = (entry, key) => {
  const v = entry?.values?.[key]?.v;
  const n = Number(v);
  return v === "" || v === null || v === undefined || !Number.isFinite(n) ? null : n;
};
const avg = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

/**
 * Medie per settimana (che termina nel giorno di consegna) di un campo dei check-in giornalieri.
 * Usa solo i giorni in cui il dato c'è e riporta quanti sono (Bibbia §5).
 */
export function weeklySeries(entries, key, { today, weekday = 0, weeks = 8 }) {
  const lastEnd = weekEndFor(today, weekday);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = addDays(lastEnd, -7 * i);
    const start = addDays(end, -6);
    const values = entries.filter(e => e.day >= start && e.day <= end).map(e => value(e, key)).filter(v => v !== null);
    out.push({ weekEnd: end, value: avg(values), count: values.length });
  }
  return out;
}

// Valori giorno per giorno (per i punti sotto la media).
export const dailyPoints = (entries, key) =>
  entries.map(e => ({ day: e.day, value: value(e, key) })).filter(p => p.value !== null).sort((a, b) => a.day.localeCompare(b.day));

// Sedute svolte per settimana.
export function workoutsPerWeek(workouts, { today, weekday = 0, weeks = 8 }) {
  const lastEnd = weekEndFor(today, weekday);
  return Array.from({ length: weeks }, (_, k) => {
    const end = addDays(lastEnd, -7 * (weeks - 1 - k));
    const start = addDays(end, -6);
    const inWeek = workouts.filter(w => w.performed_on >= start && w.performed_on <= end);
    return { weekEnd: end, done: inWeek.filter(w => w.status === "done").length, skipped: inWeek.filter(w => w.status === "skipped").length };
  });
}

// Carico migliore per settimana sugli esercizi con più dati (corpo libero escluso).
export function liftProgress(sets, workouts, { limit = 4 } = {}) {
  const day = new Map(workouts.filter(w => w.status === "done").map(w => [w.id, w.performed_on]));
  const byName = new Map();
  for (const s of sets) {
    const d = day.get(s.workout_id);
    if (!d || !(Number(s.load) > 0)) continue;
    const name = s.exercise_name;
    if (!byName.has(name)) byName.set(name, new Map());
    const m = byName.get(name);
    m.set(d, Math.max(m.get(d) || 0, Number(s.load)));
  }
  return [...byName.entries()]
    .map(([name, m]) => ({ name, points: [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ day: d, value: v })) }))
    .filter(l => l.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length || b.points.at(-1).value - a.points.at(-1).value)
    .slice(0, limit)
    .map(l => ({ ...l, first: l.points[0].value, last: l.points.at(-1).value }));
}

const fmt = (n, d = 1) => n.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const kg = n => fmt(n, n % 1 ? 1 : 0);
const signed = (n, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmt(Math.abs(n), d)}`;

// Testo informativo basato solo sui dati: il professionista lo può riscrivere.
export function progressText({ weight, steps, sleep, workouts, lifts }) {
  const parts = [];
  const w = weight.filter(p => p.value !== null);
  if (w.length >= 2) {
    const first = w[Math.max(0, w.length - 5)], last = w.at(-1);
    const diff = last.value - first.value;
    parts.push(`Il peso medio è ${fmt(last.value)} kg, ${signed(diff)} kg rispetto a ${w.length >= 5 ? "quattro" : w.length - 1} settiman${w.length - 1 === 1 && w.length < 5 ? "a" : "e"} prima.`);
  } else if (w.length === 1) parts.push(`Il peso medio dell'ultima settimana è ${fmt(w[0].value)} kg.`);
  const s = steps.filter(p => p.value !== null).slice(-4);
  if (s.length) parts.push(`In media ${Math.round(avg(s.map(p => p.value))).toLocaleString("it-IT", { useGrouping: "always" })} passi al giorno nelle ultime ${s.length === 1 ? "settimana" : `${s.length} settimane`}.`);
  const sl = sleep.filter(p => p.value !== null).slice(-4);
  if (sl.length) parts.push(`Dormi in media ${fmt(avg(sl.map(p => p.value)))} ore a notte.`);
  const last4 = workouts.slice(-4);
  const done = last4.reduce((a, b) => a + b.done, 0), skipped = last4.reduce((a, b) => a + b.skipped, 0);
  if (done || skipped) parts.push(`${done} sedute fatte nelle ultime quattro settimane${skipped ? `, ${skipped} ${skipped === 1 ? "saltata" : "saltate"}` : ""}.`);
  const up = lifts.filter(l => l.last > l.first);
  if (up.length) parts.push(`Carichi in salita su ${up.slice(0, 2).map(l => `${l.name.toLowerCase()} (${kg(l.first)} → ${kg(l.last)} kg)`).join(" e ")}.`);
  return parts.join(" ");
}
