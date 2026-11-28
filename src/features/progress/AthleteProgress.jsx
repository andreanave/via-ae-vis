import { useActor } from "../../lib/assist.jsx";
import ProgressView from "./ProgressView.jsx";

// Andamento nella scheda dell'atleta, per il professionista: può riscrivere il testo che l'atleta vede.
export default function AthleteProgress({ athleteId }) {
  const actor = useActor();
  return <ProgressView athleteId={athleteId} canEdit={!actor.assisting} actorId={actor.id} />;
}
