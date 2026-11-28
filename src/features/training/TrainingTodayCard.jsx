import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useActor } from "../../lib/assist.jsx";
import { todayIso } from "../../lib/format.js";
import { planForDay } from "../../lib/trainingRotation.js";
import { useTrainingData } from "./useTrainingData.js";

// Riga della Home dell'atleta con la seduta di oggi (anche offline, dalla copia sul telefono).
// Con showEmpty la riga resta anche senza scheda, così l'atleta sa dove la troverà.
export default function TrainingTodayCard({ showEmpty = false }) {
  const actor = useActor();
  const data = useTrainingData(actor.id);
  if (!data.program) {
    if (!showEmpty || data.loading) return null;
    return (
      <li className="link-row">
        <Link to="/allenamento">
          <span className="day-name">Allenamento</span>
          <span className="muted hint">La scheda non è ancora pronta</span>
          <ChevronRight strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" />
        </Link>
      </li>
    );
  }
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
    <li className="link-row">
      <Link to={to}>
        <span className="day-name">Allenamento</span>
        <span className="muted hint">{text}{data.pending ? " · da inviare" : ""}</span>
        <ChevronRight strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" />
      </Link>
    </li>
  );
}
