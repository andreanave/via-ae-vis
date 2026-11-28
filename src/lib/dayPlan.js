// La giornata dell'atleta: pasti del piano, integratori, allenamento e check-in, in ordine di orario.
// Gli orari vengono dalle fasce scelte dall'atleta (profiles.day_times) oppure da orari standard.
import { dayTypeFor, formatQty, supplementsFor } from "./fiber/planDay.js";

const MEAL_DEFAULTS = [
  [/colazione/i, "07:30"],
  [/spuntino.*(mattin|metà)|spuntino$/i, "10:30"],
  [/pranzo/i, "13:00"],
  [/(spuntino.*pomerig|merenda)/i, "16:30"],
  [/pre.?workout|pre.?allenamento/i, "17:45"],
  [/post.?workout|post.?allenamento/i, "20:00"],
  [/cena/i, "20:30"],
  [/(spuntino.*ser|prima di dormire)/i, "22:30"],
];
export const DEFAULT_TRAINING_TIME = "18:30";
export const CHECKIN_TIMES = { morning: "07:00", evening: "22:30", weekly: "21:00" };

const isIntra = name => /intra/i.test(name || "");

export const toMinutes = hhmm => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Chiave dell'orario di un pasto: per nome, così "Pranzo" vale per il giorno A e per il giorno B.
export const mealTimeKey = meal => `meal:${(meal.name || meal.key).trim().toLowerCase()}`;

export const mealTime = (meal, times = {}, trainingTime = DEFAULT_TRAINING_TIME) => {
  if (times[mealTimeKey(meal)]) return times[mealTimeKey(meal)];
  if (isIntra(meal.name)) return times.training || trainingTime;
  return MEAL_DEFAULTS.find(([re]) => re.test(meal.name))?.[1] || "12:00";
};

// Orario di un integratore dal testo del momento ("dopo cena", "prima di dormire"...).
export const supplementTime = (supplement, mealTimes, trainingTime) => {
  const text = `${supplement.moment || ""} ${supplement.instructions || ""}`.toLowerCase();
  const near = (re, fallback) => mealTimes.find(m => re.test(m.name))?.time || fallback;
  if (/dormire|notte/.test(text)) return "23:00";
  if (/cena/.test(text)) return near(/cena/i, "20:30");
  if (/pranzo/.test(text)) return near(/pranzo/i, "13:00");
  if (/colazione|risveglio|mattin/.test(text)) return near(/colazione/i, "07:30");
  if (/allenamento|workout/.test(text)) return trainingTime;
  return "09:00";
};

// Testo breve di un pasto: le prime opzioni di ogni gruppo ("Pasta 160 g, Petto di pollo 150 g").
export const mealSummary = (meal, choices = {}) =>
  (meal?.groups || []).map(g => {
    const option = g.options.find(o => o.key === choices[g.key]) || g.options[0];
    return option?.components.map(c => `${c.name} ${formatQty(c)}`.trim()).join(" + ");
  }).filter(Boolean).join(", ");

/**
 * Elenco ordinato delle cose della giornata.
 * plan: piano attivo (content) o null; training: { kind, label, to, done } o null;
 * checkin: { morning, evening, weekly } con { enabled, done } ciascuno; logs: righe di meal_logs del giorno.
 */
export function buildDay({ content = null, date = new Date(), times = {}, training = null, checkin = null, logs = [] }) {
  const items = [];
  const trainingTime = times.training || DEFAULT_TRAINING_TIME;
  const dayType = content ? dayTypeFor(content, date) : null;
  const logFor = (kind, key) => logs.find(l => l.kind === kind && l.item_key === key);

  const meals = (dayType?.meals || []).map(meal => ({ meal, name: meal.name, time: mealTime(meal, times, trainingTime) }));
  for (const { meal, time } of meals) {
    // L'intra-workout ha senso solo nei giorni con la seduta.
    if (isIntra(meal.name) && training && !["training", "resume", "done"].includes(training.kind)) continue;
    const log = logFor("meal", meal.key);
    items.push({
      id: `meal:${meal.key}`, kind: "meal", time, title: meal.name,
      detail: mealSummary(meal, log?.choices), macros: meal.printed || null,
      done: log?.status === "done", skipped: log?.status === "skipped",
      to: `/alimentazione/pasto/${encodeURIComponent(meal.key)}`, meal,
    });
  }

  if (content) {
    for (const s of supplementsFor(content, date).filter(x => x.today)) {
      const key = s.name;
      items.push({
        id: `supplement:${key}`, kind: "supplement", time: supplementTime(s, meals, trainingTime),
        title: [s.name, s.dose ? formatQty(s.dose) : ""].filter(Boolean).join(" "),
        detail: [s.moment, s.instructions].filter(Boolean).join(" · "), done: logFor("supplement", key)?.status === "done",
        supplementKey: key,
      });
    }
  }

  if (training && training.kind !== "rest") {
    items.push({ id: "training", kind: "training", time: trainingTime, title: training.label, detail: training.detail || "",
      done: training.kind === "done" || training.kind === "skipped", skipped: training.kind === "skipped", to: training.to });
  }

  if (checkin) {
    const labels = { morning: "Check-in del mattino", evening: "Check-out serale", weekly: "Check-in settimanale" };
    const links = { morning: "/checkin/morning", evening: "/checkin/evening", weekly: "/settimanale" };
    for (const k of ["morning", "evening", "weekly"]) {
      if (!checkin[k]?.enabled) continue;
      items.push({ id: `checkin:${k}`, kind: "checkin", time: times[`checkin:${k}`] || CHECKIN_TIMES[k], title: labels[k],
        detail: "", done: Boolean(checkin[k].done), to: links[k] });
    }
  }

  return { dayType, items: items.sort((a, b) => toMinutes(a.time) - toMinutes(b.time) || a.id.localeCompare(b.id)) };
}

// Cosa proporre "adesso": la prima cosa non fatta dall'ora corrente (con un'ora di tolleranza all'indietro),
// altrimenti la prima rimasta indietro. Gli integratori non vanno in primo piano.
export const pickNow = (items, now = new Date()) => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const open = items.filter(i => !i.done && i.kind !== "supplement");
  return open.find(i => toMinutes(i.time) >= minutes - 60) || open[open.length - 1] || null;
};

// Le scelte già registrate in settimana per un'opzione con frequenza consigliata.
// logs: meal_logs della settimana (escluso il pasto in corso). Ritorna i giorni in cui è stata scelta.
export const timesChosen = (optionKey, logs) =>
  logs.filter(l => l.status === "done" && Object.values(l.choices || {}).includes(optionKey)).map(l => l.day);

// Lunedì della settimana di una data ISO.
export const weekStart = iso => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
