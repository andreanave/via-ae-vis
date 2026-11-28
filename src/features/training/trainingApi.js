import { supabase } from "../../lib/supabase.js";
import { newId } from "../../lib/trainingOutbox.js";

export const EXERCISE_FIELDS = "id, session_id, position, exercise_id, name, group_label, sets, reps, load, tempo, rir, rest_seconds, notes, film, video_url, bodyweight, set_details";

// Scheda completa: sedute ordinate, ciascuna con i suoi esercizi ordinati.
export async function loadProgram(programId) {
  const [p, s] = await Promise.all([
    supabase.from("programs").select("*").eq("id", programId).maybeSingle(),
    supabase.from("program_sessions").select("id, program_id, position, name, notes").eq("program_id", programId).order("position"),
  ]);
  if (p.error || s.error) throw p.error || s.error;
  if (!p.data) return null;
  const sessionIds = (s.data || []).map(x => x.id);
  const e = sessionIds.length
    ? await supabase.from("session_exercises").select(EXERCISE_FIELDS).in("session_id", sessionIds).order("position")
    : { data: [] };
  if (e.error) throw e.error;
  return {
    ...p.data,
    sessions: (s.data || []).map(x => ({ ...x, exercises: (e.data || []).filter(r => r.session_id === x.id) })),
  };
}

export async function loadActiveProgram(athleteId) {
  const { data, error } = await supabase.from("programs").select("id").eq("athlete_id", athleteId).eq("status", "active").maybeSingle();
  if (error) throw error;
  return data ? loadProgram(data.id) : null;
}

// Salva l'intera scheda: aggiorna ciò che c'è, cancella sedute ed esercizi tolti.
export async function saveProgram(program, original) {
  const { sessions, ...row } = program;
  const base = {
    id: row.id, athlete_id: row.athlete_id, professional_id: row.professional_id, name: row.name, notes: row.notes,
    training_weekdays: row.training_weekdays, starts_on: row.starts_on, updated_at: new Date().toISOString(),
  };
  if (!original) base.status = "draft";
  const r1 = await supabase.from("programs").upsert(base, { onConflict: "id" });
  if (r1.error) throw r1.error;

  const keepSessions = new Set(sessions.map(s => s.id));
  const goneSessions = (original?.sessions || []).map(s => s.id).filter(id => !keepSessions.has(id));
  if (goneSessions.length) {
    const r = await supabase.from("program_sessions").delete().in("id", goneSessions);
    if (r.error) throw r.error;
  }
  if (sessions.length) {
    const r = await supabase.from("program_sessions").upsert(
      sessions.map((s, i) => ({ id: s.id, program_id: row.id, position: i, name: s.name, notes: s.notes || "" })), { onConflict: "id" });
    if (r.error) throw r.error;
  }
  const keepEx = new Set(sessions.flatMap(s => s.exercises.map(e => e.id)));
  const goneEx = (original?.sessions || []).flatMap(s => s.exercises.map(e => e.id)).filter(id => !keepEx.has(id));
  if (goneEx.length) {
    const r = await supabase.from("session_exercises").delete().in("id", goneEx);
    if (r.error) throw r.error;
  }
  const exRows = sessions.flatMap(s => s.exercises.map((e, i) => ({
    id: e.id, session_id: s.id, position: i, exercise_id: e.exercise_id || null, name: e.name.trim() || "Esercizio",
    group_label: e.group_label?.trim() || null, sets: Number(e.sets) || 1, reps: e.reps || "", load: e.load || "",
    tempo: e.tempo || "", rir: e.rir || "", rest_seconds: e.rest_seconds === "" || e.rest_seconds == null ? null : Number(e.rest_seconds),
    notes: e.notes || "", film: e.film || "", video_url: e.video_url?.trim() || null, bodyweight: Boolean(e.bodyweight),
    set_details: e.set_details || [],
  })));
  if (exRows.length) {
    const r = await supabase.from("session_exercises").upsert(exRows, { onConflict: "id" });
    if (r.error) throw r.error;
  }
}

// Copia di una scheda come nuova bozza (per il blocco successivo).
export const cloneProgram = program => ({
  ...program,
  id: newId(), name: `${program.name} (copia)`, status: "draft", starts_on: new Date().toISOString().slice(0, 10),
  sessions: program.sessions.map(s => ({ ...s, id: newId(), exercises: s.exercises.map(e => ({ ...e, id: newId() })) })),
});

export const emptyExercise = () => ({
  id: newId(), exercise_id: null, name: "", group_label: "", sets: 3, reps: "", load: "", tempo: "", rir: "",
  rest_seconds: 90, notes: "", film: "", video_url: "", bodyweight: false, set_details: [],
});

// Sedute registrate con le serie, dalla più recente.
export async function loadWorkouts(athleteId, limit = 40) {
  const { data: workouts, error } = await supabase.from("workout_logs").select("*")
    .eq("athlete_id", athleteId).order("performed_on", { ascending: false }).limit(limit);
  if (error) throw error;
  const ids = (workouts || []).map(w => w.id);
  const sets = ids.length ? (await supabase.from("set_logs").select("*").in("workout_id", ids)).data || [] : [];
  return { workouts: workouts || [], sets };
}

export async function loadOverrides(athleteId, from) {
  const { data, error } = await supabase.from("schedule_overrides").select("day, kind").eq("athlete_id", athleteId).gte("day", from);
  if (error) throw error;
  return data || [];
}

export async function loadCatalog(ownerId) {
  const { data, error } = await supabase.from("exercises").select("*").eq("owner_id", ownerId).order("name");
  if (error) throw error;
  return data || [];
}
