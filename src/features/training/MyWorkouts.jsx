import { Link } from "react-router-dom";
import { useActor } from "../../lib/assist.jsx";
import WorkoutHistory from "./WorkoutHistory.jsx";
import { ChevronLeft } from "lucide-react";

export default function MyWorkouts() {
  const actor = useActor();
  return (
    <section className="page narrow">
      <Link to="/allenamento" className="back"><ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />Allenamento</Link>
      <h1>Le mie sedute</h1>
      <WorkoutHistory athleteId={actor.id} />
    </section>
  );
}
