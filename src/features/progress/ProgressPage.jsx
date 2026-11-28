import { useActor } from "../../lib/assist.jsx";
import ProgressView from "./ProgressView.jsx";

// Andamento visto dall'atleta (voce "Andamento" della barra in basso).
export default function ProgressPage() {
  const actor = useActor();
  return (
    <section className="stack" style={{ maxWidth: 640, margin: "0 auto", gap: "1.5rem" }}>
      <div className="page-head">
        <span className="eyebrow">Ultime 8 settimane</span>
        <h1>Andamento</h1>
      </div>
      <ProgressView athleteId={actor.id} />
    </section>
  );
}
