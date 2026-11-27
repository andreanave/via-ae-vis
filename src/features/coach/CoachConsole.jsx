import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";

const initials = name => (name || "?").split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();

// All'apertura: l'elenco degli atleti seguiti. Contatori e scheda arrivano con la fase 1.
export default function CoachConsole() {
  const { user } = useAuth();
  const [athletes, setAthletes] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("care_links")
      .select("athlete:profiles!care_links_athlete_id_fkey(id, full_name)")
      .eq("professional_id", user.id)
      .eq("status", "active")
      .then(({ data, error: err }) => {
        if (err) { setError("Non riesco a caricare gli atleti."); setAthletes([]); return; }
        setAthletes((data || []).map(r => r.athlete).filter(Boolean));
      });
  }, [user.id]);

  return (
    <section>
      <h1>I tuoi atleti</h1>
      {error && <div className="notice error">{error}</div>}
      {athletes === null && <p className="muted">Caricamento…</p>}
      {athletes?.length === 0 && !error && <p className="muted">Nessun atleta collegato. Invita il primo atleta per iniziare.</p>}
      <ul className="list">
        {athletes?.map(a => (
          <li key={a.id}>
            <div className="row">
              <span className="avatar">{initials(a.full_name)}</span>
              <span>{a.full_name || "Atleta"}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
