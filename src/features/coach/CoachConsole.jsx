import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { initials } from "../../lib/format.js";
import InviteForm from "./InviteForm.jsx";

// All'apertura: l'elenco degli atleti, con il numero di cose che aspettano il coach.
export default function CoachConsole() {
  const actor = useActor();
  const [athletes, setAthletes] = useState(null);
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase
        .from("care_links")
        .select("modules, athlete:profiles!care_links_athlete_id_fkey(id, full_name)")
        .eq("professional_id", actor.id)
        .eq("status", "active"),
      supabase.from("coach_open_tasks").select("athlete_id, open_count").eq("professional_id", actor.id),
    ]).then(([links, tasks]) => {
      if (!active) return;
      if (links.error) { setError("Non riesco a caricare gli atleti."); setAthletes([]); return; }
      const counts = Object.fromEntries((tasks.data || []).map(t => [t.athlete_id, t.open_count]));
      const list = (links.data || [])
        .filter(r => r.athlete)
        .map(r => ({ ...r.athlete, modules: r.modules, pending: counts[r.athlete.id] || 0 }))
        .sort((a, b) => b.pending - a.pending || (a.full_name || "").localeCompare(b.full_name || "", "it"));
      setAthletes(list);
    });
    return () => { active = false; };
  }, [actor.id]);

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>I tuoi atleti</h1>
        {!actor.assisting && !inviting && <button className="btn" type="button" onClick={() => setInviting(true)}>Invita</button>}
      </div>
      {inviting && <div className="card" style={{ marginBottom: "1rem" }}><InviteForm onDone={() => setInviting(false)} /></div>}
      {error && <div className="notice error">{error}</div>}
      {athletes === null && <p className="muted">Caricamento…</p>}
      {athletes?.length === 0 && !error && <p className="muted">Nessun atleta collegato. Invita il primo atleta per iniziare.</p>}
      <ul className="list">
        {athletes?.map(a => (
          <li key={a.id}>
            <Link className="row" to={`/atleti/${a.id}`}>
              <span className="avatar" aria-hidden="true">{initials(a.full_name)}</span>
              <span>{a.full_name || "Atleta"}</span>
              {a.pending > 0 && (
                <span className="badge" aria-label={`${a.pending} cose da fare`}>{a.pending}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
