import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { createOutbox } from "../../lib/trainingOutbox.js";
import { addDays } from "../../lib/checkinMath.js";
import { todayIso } from "../../lib/format.js";
import { loadActiveProgram, loadOverrides, loadWorkouts } from "./trainingApi.js";

// Dati dell'allenamento dell'atleta. Con la rete li scarica e ne tiene una copia sul telefono;
// senza rete usa la copia. Le sedute ancora in coda hanno la precedenza su quelle del server.
export function useTrainingData(athleteId) {
  const outbox = useMemo(() => createOutbox(athleteId), [athleteId]);
  const [remote, setRemote] = useState(() => outbox.cache());
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(() => outbox.pendingCount());

  const sync = useCallback(async () => {
    if (outbox.pendingCount()) await outbox.flush(supabase);
    setPending(outbox.pendingCount());
  }, [outbox]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await sync();
        const [program, history, overrides] = await Promise.all([
          loadActiveProgram(athleteId), loadWorkouts(athleteId, 60), loadOverrides(athleteId, addDays(todayIso(), -7)),
        ]);
        const ids = [...new Set((program?.sessions || []).flatMap(s => s.exercises.map(e => e.exercise_id)).filter(Boolean))];
        const catalog = ids.length ? (await supabase.from("exercises").select("id, instructions, video_url").in("id", ids)).data || [] : [];
        const value = { program, ...history, overrides, catalog, fetchedAt: new Date().toISOString() };
        outbox.cache(value);
        if (active) { setRemote(value); setOffline(false); }
      } catch {
        if (active) setOffline(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [athleteId, version, outbox, sync]);

  useEffect(() => {
    const onOnline = () => { sync().then(() => setVersion(v => v + 1)); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [sync]);

  const merged = useMemo(() => {
    const base = remote || { program: null, workouts: [], sets: [], overrides: [], catalog: [] };
    const local = Object.values(outbox.all());
    const localIds = new Set(local.map(e => e.workout.id));
    const workouts = [...base.workouts.filter(w => !localIds.has(w.id)), ...local.map(e => e.workout)];
    const localSets = local.flatMap(e => Object.values(e.sets).filter(s => !s.deleted));
    const sets = [...base.sets.filter(s => !localIds.has(s.workout_id)), ...localSets];
    return { ...base, workouts, sets };
  }, [remote, outbox, pending, version]);

  return { ...merged, outbox, loading, offline, pending, sync, reload: () => setVersion(v => v + 1), setPending };
}
