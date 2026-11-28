// Coda locale delle sedute: tutto viene salvato prima sul telefono e inviato quando c'è rete.
// Gli id sono generati qui, quindi reinviare gli stessi dati aggiorna le righe invece di duplicarle.

const WORKOUT_COLUMNS = ["id", "athlete_id", "program_id", "session_id", "session_name", "performed_on", "status", "notes", "started_at", "finished_at", "client_updated_at"];
const SET_COLUMNS = ["id", "workout_id", "session_exercise_id", "exercise_name", "set_index", "load", "reps", "note", "done_at", "client_updated_at"];
const pick = (row, cols) => Object.fromEntries(cols.filter(c => row[c] !== undefined).map(c => [c, row[c]]));

const KEY = athleteId => `app.training.outbox.${athleteId}`;
const CACHE = athleteId => `app.training.cache.${athleteId}`;

const read = (storage, key, fallback) => {
  try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const write = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); } catch { /* spazio pieno */ } };

export const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  }));

export function createOutbox(athleteId, storage = globalThis.localStorage) {
  const load = () => read(storage, KEY(athleteId), {});
  const save = data => write(storage, KEY(athleteId), data);
  const stamp = () => new Date().toISOString();

  return {
    // Tutte le sedute in coda, con le loro serie.
    all: () => load(),
    // Sedute con modifiche non ancora inviate.
    pendingCount: () => Object.values(load()).filter(e => e.dirty).length,
    get: id => load()[id] || null,

    putWorkout(workout) {
      const data = load();
      const prev = data[workout.id] || { sets: {} };
      data[workout.id] = { ...prev, dirty: true, workout: { ...prev.workout, ...workout, client_updated_at: stamp() } };
      save(data);
      return data[workout.id];
    },

    putSet(workoutId, set) {
      const data = load();
      const entry = data[workoutId];
      if (!entry) throw new Error("workout_not_in_outbox");
      entry.sets[set.id] = { ...entry.sets[set.id], ...set, workout_id: workoutId, client_updated_at: stamp() };
      entry.dirty = true;
      save(data);
      return entry.sets[set.id];
    },

    removeSet(workoutId, setId) {
      const data = load();
      const entry = data[workoutId];
      if (!entry?.sets[setId]) return;
      entry.sets[setId] = { ...entry.sets[setId], deleted: true, client_updated_at: stamp() };
      entry.dirty = true;
      save(data);
    },

    // Invia le sedute modificate. Una seduta resta in memoria finché è aperta, così le modifiche
    // successive ripartono complete; esce quando è chiusa e inviata, e non è cambiata nel frattempo.
    async flush(client) {
      const data = load();
      const results = { sent: 0, failed: 0 };
      for (const [id, entry] of Object.entries(data)) {
        if (!entry.dirty) continue;
        try {
          const { error: we } = await client.from("workout_logs").upsert(pick(entry.workout, WORKOUT_COLUMNS), { onConflict: "id" });
          if (we) throw we;
          const sets = Object.values(entry.sets);
          const live = sets.filter(s => !s.deleted).map(s => pick(s, SET_COLUMNS));
          const gone = sets.filter(s => s.deleted).map(s => s.id);
          if (live.length) {
            const { error } = await client.from("set_logs").upsert(live, { onConflict: "id" });
            if (error) throw error;
          }
          if (gone.length) {
            const { error } = await client.from("set_logs").delete().in("id", gone);
            if (error) throw error;
          }
          const now = load();
          if (JSON.stringify(now[id]) === JSON.stringify(entry)) {
            if (entry.workout.status === "in_progress") {
              now[id] = { ...entry, dirty: false, sets: Object.fromEntries(Object.entries(entry.sets).filter(([, s]) => !s.deleted)) };
            } else delete now[id];
            save(now);
          }
          results.sent++;
        } catch {
          results.failed++;
        }
      }
      return results;
    },

    // Copia della scheda per usarla in palestra senza rete.
    cache: value => (value === undefined ? read(storage, CACHE(athleteId), null) : write(storage, CACHE(athleteId), value)),
  };
}
