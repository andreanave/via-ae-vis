import { addDays } from "./checkinMath.js";

// Giorno della settimana (0 = domenica) di una data YYYY-MM-DD.
export const weekdayOf = iso => new Date(`${iso}T12:00:00`).getDay();

// Un giorno è di allenamento se l'atleta l'ha deciso, altrimenti se cade nei giorni della scheda.
export const isTrainingDay = (day, trainingWeekdays = [], overrides = []) => {
  const o = overrides.find(x => x.day === day);
  if (o) return o.kind === "training";
  return trainingWeekdays.includes(weekdayOf(day));
};

const byPosition = sessions => [...sessions].sort((a, b) => a.position - b.position);

// Sedute completate in ordine cronologico. Le saltate non fanno avanzare la rotazione.
const doneLogs = logs => logs
  .filter(l => l.status === "done")
  .sort((a, b) => (a.performed_on + (a.finished_at || "")).localeCompare(b.performed_on + (b.finished_at || "")));

// Prossima seduta della rotazione (A, B, C, D, A…): quella dopo l'ultima completata.
export const nextSessionIndex = (sessions, logs, programId) => {
  const list = byPosition(sessions);
  if (!list.length) return -1;
  const done = doneLogs(logs.filter(l => !programId || l.program_id === programId));
  if (!done.length) return 0;
  const last = done[done.length - 1];
  let i = list.findIndex(s => s.id === last.session_id);
  if (i === -1) i = list.findIndex(s => s.name === last.session_name);
  if (i === -1) return done.length % list.length;
  return (i + 1) % list.length;
};

export const nextSession = (sessions, logs, programId) => {
  const i = nextSessionIndex(sessions, logs, programId);
  return i === -1 ? null : byPosition(sessions)[i];
};

// Cosa propone l'app per un giorno: riprendere una seduta aperta, allenarsi o riposare.
export const planForDay = ({ day, program, sessions, logs, overrides }) => {
  if (!program || !sessions?.length) return { kind: "none" };
  const today = logs.filter(l => l.performed_on === day);
  const open = today.find(l => l.status === "in_progress");
  if (open) return { kind: "resume", workout: open, session: sessions.find(s => s.id === open.session_id) || null };
  const finished = today.find(l => l.status === "done");
  if (finished) return { kind: "done", workout: finished };
  const skipped = today.find(l => l.status === "skipped");
  if (skipped) return { kind: "skipped", workout: skipped, session: nextSession(sessions, logs, program.id) };
  const training = isTrainingDay(day, program.training_weekdays, overrides);
  return { kind: training ? "training" : "rest", session: nextSession(sessions, logs, program.id) };
};

// Calendario dei prossimi giorni: ogni giorno di allenamento riceve la seduta successiva della rotazione.
export const upcomingDays = ({ from, days = 14, program, sessions, logs, overrides }) => {
  const list = byPosition(sessions || []);
  if (!program || !list.length) return [];
  let i = nextSessionIndex(list, logs, program.id);
  const out = [];
  for (let n = 0; n < days; n++) {
    const day = addDays(from, n);
    const doneToday = logs.find(l => l.performed_on === day && l.status === "done");
    if (doneToday) { out.push({ day, kind: "done", session: list.find(s => s.id === doneToday.session_id) || null }); continue; }
    if (logs.some(l => l.performed_on === day && l.status === "skipped")) { out.push({ day, kind: "skipped" }); continue; }
    if (isTrainingDay(day, program.training_weekdays, overrides)) {
      out.push({ day, kind: "training", session: list[i] });
      i = (i + 1) % list.length;
    } else out.push({ day, kind: "rest" });
  }
  return out;
};

// Serie dell'ultima seduta completata in cui compare l'esercizio (stessa riga della scheda o stesso nome).
export const previousSets = ({ exercise, workouts, sets, excludeWorkoutId }) => {
  const done = doneLogs(workouts).filter(w => w.id !== excludeWorkoutId).reverse();
  const name = (exercise.name || "").trim().toLowerCase();
  for (const w of done) {
    const mine = sets.filter(s => s.workout_id === w.id && (
      s.session_exercise_id === exercise.id || (s.exercise_name || "").trim().toLowerCase() === name));
    if (mine.length) return { workout: w, sets: [...mine].sort((a, b) => a.set_index - b.set_index) };
  }
  return null;
};

// Prescrizione della singola serie: i dettagli per serie, se presenti, sostituiscono i valori generali.
export const setTarget = (exercise, index) => {
  const d = (exercise.set_details || [])[index] || {};
  return {
    reps: d.reps || exercise.reps || "",
    load: d.load || exercise.load || "",
    rir: d.rir || exercise.rir || "",
    note: d.note || "",
  };
};

// Timer di recupero basato sull'orario di fine: resta corretto anche se il telefono sospende la pagina.
export const restRemaining = (endsAt, now = Date.now()) => Math.max(0, Math.ceil((endsAt - now) / 1000));
export const formatClock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// Raggruppa gli esercizi in blocchi: quelli con la stessa lettera (A1, A2) formano un jump set.
export const groupBlocks = exercises => {
  const blocks = [];
  for (const ex of [...exercises].sort((a, b) => a.position - b.position)) {
    const letter = (ex.group_label || "").match(/^[A-Za-z]+/)?.[0]?.toUpperCase();
    const last = blocks[blocks.length - 1];
    if (letter && last?.letter === letter) last.items.push(ex);
    else blocks.push({ letter: letter || null, items: [ex] });
  }
  return blocks;
};
