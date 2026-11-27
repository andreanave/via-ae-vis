import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";

const greeting = (date = new Date()) => {
  const h = date.getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
};

// Home dell'atleta: una sola proposta coerente con l'ora. Il contenuto arriva con le fasi 2-4.
export default function AthleteHome() {
  const actor = useActor();
  const [team, setTeam] = useState([]);
  const firstName = (actor.fullName || "").split(" ")[0];

  useEffect(() => {
    supabase.from("care_links").select("professional:profiles!care_links_professional_id_fkey(id, full_name)")
      .eq("athlete_id", actor.id).eq("status", "active")
      .then(({ data }) => setTeam((data || []).map(r => r.professional).filter(Boolean)));
  }, [actor.id]);

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <h1>{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
      <div className="card">
        <h2>Adesso</h2>
        <p className="muted">Qui troverai l'attività del momento: check-in, pasto o allenamento.</p>
      </div>
      {team.length > 0 && (
        <p className="muted">Ti seguono: {team.map(p => p.full_name || "un professionista").join(", ")}.</p>
      )}
    </section>
  );
}
