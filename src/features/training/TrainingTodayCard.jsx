import { Link } from "react-router-dom";
import { useActor } from "../../lib/assist.jsx";
import { todayIso } from "../../lib/format.js";
import { planForDay } from "../../lib/trainingRotation.js";
import { useTrainingData } from "./useTrainingData.js";

// Riga della Home dell'atleta con la seduta di oggi (anche offline, dalla copia sul telefono).
export default function TrainingTodayCard() {
  const actor = useActor();
  const data = useTrainingData(actor.id);
  if (!data.program) return null;
  const plan = planForDay({ day: todayIso(), program: data.program, sessions: data.program.sessions, logs: data.workouts, overrides: data.overrides || [] });
  const text = {
    resume: `${plan.workout?.session_name} in corso: riprendi`,
    training: `Oggi: ${plan.session?.name}`,
    rest: "Oggi riposo",
    done: "Seduta di oggi completata",
    skipped: "Oggi salti l'allenamento",
  }[plan.kind];
  if (!text) return null;
  const to = plan.kind === "resume" ? `/allenamento/seduta/${plan.workout.id}` : "/allenamento";
  return (
    <li>
      <Link to={to} className="row" style={{ textDecoration: "none", color: "inherit" }}>
        <span style={{ flex: 1 }}>Allenamento</span>
        <span className="muted">{text}{data.pending ? " · da inviare" : ""}</span>
      </Link>
    </li>
  );
}
