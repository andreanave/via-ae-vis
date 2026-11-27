import { FIELD_BY_KEY } from "./checkinFields.js";

// Date in formato YYYY-MM-DD, calcolate a mezzogiorno per evitare problemi di ora legale.
const toDate = iso => new Date(`${iso}T12:00:00`);
const toIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (iso, n) => { const d = toDate(iso); d.setDate(d.getDate() + n); return toIso(d); };

// Fine della settimana del check-in: il prossimo giorno "weekday" (0 = domenica) a partire da oggi incluso.
export const weekEndFor = (todayIso, weekday) => {
  const d = toDate(todayIso);
  const diff = (weekday - d.getDay() + 7) % 7;
  return addDays(todayIso, diff);
};

// I sette giorni che compongono la settimana che termina in weekEnd.
export const weekDays = weekEnd => Array.from({ length: 7 }, (_, i) => addDays(weekEnd, i - 6));

const isPresent = v => v !== undefined && v !== null && v !== "" && !(typeof v === "number" && Number.isNaN(v));

// Valore giornaliero di un campo, guardando mattino e sera (il mattino ha la precedenza).
export const dailyValue = (entriesOfDay = {}, key) => {
  for (const moment of ["morning", "evening"]) {
    const cell = entriesOfDay[moment]?.values?.[key];
    if (cell && isPresent(cell.v)) return cell;
  }
  return null;
};

const round = (value, step = 0.1) => {
  const decimals = step >= 1 ? 0 : String(step).split(".")[1]?.length || 1;
  return Number(value.toFixed(Math.min(decimals, 2)));
};

// Aggregato di un campo sui giorni della settimana. Uno zero inserito è un valore valido.
// entriesByDay = { "2026-11-23": { morning: {values}, evening: {values} }, ... }
export const aggregateField = (key, days, entriesByDay) => {
  const field = FIELD_BY_KEY[key];
  const sources = [];
  for (const day of days) {
    const cell = dailyValue(entriesByDay[day], key);
    if (cell) sources.push({ day, value: cell.v, source: cell.source || "manual", edited: Boolean(cell.edited) });
  }
  if (!field || field.agg === "none" || field.type === "text") {
    return { key, value: null, count: sources.length, sources };
  }
  const numbers = sources.map(s => Number(s.value)).filter(n => Number.isFinite(n));
  if (numbers.length === 0) return { key, value: null, count: 0, sources };
  const total = numbers.reduce((a, b) => a + b, 0);
  const raw = field.agg === "sum" ? total : total / numbers.length;
  return { key, value: round(raw, field.step ?? (field.type === "scale" ? 0.1 : 1)), raw, count: numbers.length, sources };
};

// Valore usato nel resoconto: la correzione dell'atleta se c'è, altrimenti quello calcolato.
export const resolveWeeklyValue = (aggregate, override) => {
  if (override && isPresent(override.v)) {
    return { value: override.v, origin: "override", computed: aggregate?.value ?? null, count: aggregate?.count ?? 0 };
  }
  if (aggregate && aggregate.value !== null) {
    return { value: aggregate.value, origin: "computed", computed: aggregate.value, count: aggregate.count };
  }
  return { value: null, origin: "missing", computed: null, count: 0 };
};

// Campi obbligatori ancora vuoti, nell'ordine del modulo.
export const missingRequired = (weeklyConfig, resolvedByKey, answers = {}) =>
  weeklyConfig
    .filter(w => w.required)
    .filter(w => {
      const field = FIELD_BY_KEY[w.key];
      if (field?.type === "text") return !isPresent((answers[w.key] ?? "").toString().trim());
      return !isPresent(resolvedByKey[w.key]?.value);
    })
    .map(w => w.key);

// Raggruppa le righe di daily_entries per giorno e momento.
export const groupEntries = rows => {
  const out = {};
  for (const r of rows || []) {
    out[r.day] = out[r.day] || {};
    out[r.day][r.moment] = r;
  }
  return out;
};

// Testo informativo breve sull'andamento, basato solo sui dati (il coach può riscriverlo).
export const formatNumber = (value, field) => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const decimals = field?.type === "scale" ? 1 : field?.step && field.step < 1 ? 1 : 0;
  return n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
};
