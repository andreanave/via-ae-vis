import { useEffect, useState } from "react";
import { formatDay } from "../../lib/format.js";
import { loadWorkouts } from "./trainingApi.js";

const STATUS = { done: "Completata", skipped: "Saltata", in_progress: "In corso" };
export const formatLoad = (load, bodyweight) => {
  if (load === null || load === undefined || load === "") return "—";
  const n = Number(load);
  if (bodyweight && n === 0) return "corpo libero";
  return `${bodyweight ? "+" : ""}${String(n).replace(".", ",")} kg`;
};

// Sedute registrate dall'atleta: serie per esercizio, note per serie e della seduta.
export default function WorkoutHistory({ athleteId }) {
  const [data, setData] = useState(undefined);
  const [open, setOpen] = useState({});

  useEffect(() => { loadWorkouts(athleteId).then(setData).catch(() => setData({ workouts: [], sets: [] })); }, [athleteId]);

  if (data === undefined) return <p className="muted">Caricamento…</p>;
  if (!data.workouts.length) return <div className="notice">Nessuna seduta registrata finora.</div>;

  return (
    <ul className="lines">
      {data.workouts.map(w => {
        const sets = data.sets.filter(s => s.workout_id === w.id).sort((a, b) => a.set_index - b.set_index);
        const byExercise = [];
        for (const s of sets) {
          const key = s.session_exercise_id || s.exercise_name;
          let g = byExercise.find(x => x.key === key);
          if (!g) byExercise.push(g = { key, name: s.exercise_name, sets: [] });
          g.sets.push(s);
        }
        const isOpen = open[w.id];
        return (
          <li key={w.id} className="history-item">
            <button type="button" className="history-toggle" aria-expanded={Boolean(isOpen)} onClick={() => setOpen({ ...open, [w.id]: !isOpen })}>
              <span className="day-name">{formatDay(w.performed_on)} · {w.session_name || "Seduta"}</span>
              <span className="muted">{STATUS[w.status]}{w.notes ? " · nota" : ""}</span>
            </button>
            {isOpen && (
              <div className="history-body">
                {w.notes && <p><strong>Nota della seduta:</strong> {w.notes}</p>}
                {byExercise.length === 0 && <span className="muted">Nessuna serie registrata.</span>}
                {byExercise.map(g => (
                  <div key={g.key}>
                    <div className="history-ex">{g.name}</div>
                    <ol className="history-sets">
                      {g.sets.map(s => (
                        <li key={s.id}>
                          <span className="num">{formatLoad(s.load, false)} × {s.reps ?? "—"}</span>{s.note ? ` · ${s.note}` : ""}{!s.done_at ? " · non completata" : ""}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
