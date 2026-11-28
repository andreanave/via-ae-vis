import { Link } from "react-router-dom";
import { useActor } from "../../lib/assist.jsx";
import WorkoutHistory from "./WorkoutHistory.jsx";

export default function MyWorkouts() {
  const actor = useActor();
  return (
    <section style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      <Link to="/allenamento" className="muted" style={{ textDecoration: "none" }}>← Allenamento</Link>
      <h1 style={{ margin: 0 }}>Le mie sedute</h1>
      <WorkoutHistory athleteId={actor.id} />
    </section>
  );
}
