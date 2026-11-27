import { useAuth } from "../auth/AuthProvider.jsx";

const greeting = (date = new Date()) => {
  const h = date.getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
};

// Home dell'atleta: una sola proposta coerente con l'ora. Il contenuto arriva con le fasi 2-4.
export default function AthleteHome() {
  const { profile } = useAuth();
  const firstName = (profile?.full_name || "").split(" ")[0];
  return (
    <section>
      <h1>{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
      <div className="card">
        <h2>Adesso</h2>
        <p className="muted">Qui troverai l'attività del momento: check-in, pasto o allenamento.</p>
      </div>
    </section>
  );
}
