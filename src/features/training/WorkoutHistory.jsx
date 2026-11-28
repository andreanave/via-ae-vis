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
    <ul className="list">
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
          <li key={w.id} style={{ display: "grid" }}>
            <button type="button" className="row" aria-expanded={Boolean(isOpen)} onClick={() => setOpen({ ...open, [w.id]: !isOpen })}
              style={{ width: "100%", textAlign: "left", background: "none", border: 0, font: "inherit", color: "inherit", cursor: "pointer" }}>
              <span style={{ flex: 1 }}>{formatDay(w.performed_on)} · {w.session_name || "Seduta"}</span>
              <span className="muted">{STATUS[w.status]}{w.notes ? " · nota" : ""}</span>
            </button>
            {isOpen && (
              <div style={{ padding: "0 1rem 1rem", display: "grid", gap: "0.75rem" }}>
                {w.notes && <p style={{ margin: 0 }}><strong>Nota della seduta:</strong> {w.notes}</p>}
                {byExercise.length === 0 && <span className="muted">Nessuna serie registrata.</span>}
                {byExercise.map(g => (
                  <div key={g.key}>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    <ol style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
                      {g.sets.map(s => (
                        <li key={s.id}>
                          {formatLoad(s.load, false)} × {s.reps ?? "—"}{s.note ? ` · ${s.note}` : ""}{!s.done_at ? " · non completata" : ""}
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
