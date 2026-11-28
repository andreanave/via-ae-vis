import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { buildDay } from "../../lib/dayPlan.js";
import { weekEndFor } from "../../lib/checkinMath.js";
import { todayIso } from "../../lib/format.js";
import { planForDay } from "../../lib/trainingRotation.js";
import { loadEntries, loadSettings, loadWeekly } from "../checkin/checkinApi.js";
import { loadActivePlan } from "../nutrition/nutritionApi.js";
import { loadDayTimes, loadMealLogs } from "../nutrition/mealLogApi.js";
import { useTrainingData } from "../training/useTrainingData.js";

// Tutto quello che serve alla giornata dell'atleta: piano, seduta, check-in, diario e orari.
export function useAthleteDay(athleteId) {
  const training = useTrainingData(athleteId);
  const [state, setState] = useState(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    let active = true;
    (async () => {
      const day = todayIso();
      const [links, plan, config, logs, times] = await Promise.all([
        supabase.from("care_links").select("modules, professional:profiles!care_links_professional_id_fkey(id, full_name)")
          .eq("athlete_id", athleteId).eq("status", "active").then(r => r.data || []),
        loadActivePlan(athleteId).catch(() => null),
        loadSettings(athleteId).catch(() => null),
        loadMealLogs(athleteId, day).catch(() => []),
        loadDayTimes(athleteId).catch(() => ({})),
      ]);
      let checkin = null;
      if (config) {
        const end = weekEndFor(day, config.weekday);
        const [rows, weekly] = await Promise.all([loadEntries(athleteId, day, day), loadWeekly(athleteId, end)]);
        const today = Object.fromEntries(rows.map(r => [r.moment, r]));
        checkin = {
          morning: { enabled: config.morning.length > 0, done: today.morning?.status === "done" },
          evening: { enabled: config.evening.length > 0, done: today.evening?.status === "done" },
          // Il settimanale compare nel giorno di consegna, o prima se l'atleta ha già iniziato la bozza.
          weekly: { enabled: config.weekly.length > 0 && (end === day || weekly?.status === "draft"), done: weekly?.status === "confirmed" },
        };
      }
      if (active) setState({ links, plan, checkin, logs, times, modules: new Set(links.flatMap(l => l.modules || [])) });
    })().catch(() => active && setState(s => s || { links: [], plan: null, checkin: null, logs: [], times: {}, modules: new Set() }));
    return () => { active = false; };
  }, [athleteId, version]);

  let trainingItem = null;
  if (training.program) {
    const p = planForDay({ day: todayIso(), program: training.program, sessions: training.program.sessions, logs: training.workouts, overrides: training.overrides || [] });
    const name = p.workout?.session_name || p.session?.name || "";
    trainingItem = {
      kind: p.kind,
      label: `Allenamento${name ? ` · ${name}` : ""}`,
      detail: { resume: "In corso: riprendi", done: "Completato", skipped: "Saltato", training: training.pending ? "Da inviare" : "" }[p.kind] || "",
      to: p.kind === "resume" ? `/allenamento/seduta/${p.workout.id}` : "/allenamento",
    };
  }

  const day = state ? buildDay({ content: state.plan?.content || null, times: state.times, training: trainingItem, checkin: state.checkin, logs: state.logs }) : null;
  return { loading: !state, ...state, day, reload };
}
