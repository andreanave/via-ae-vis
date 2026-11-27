import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, UserPlus } from "lucide-react";
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
    <section style={{ maxWidth: 720 }}>
      <div className="page-head" style={{ marginBottom: "1.5rem" }}>
        <span className="eyebrow">{athletes ? `${athletes.length} ${athletes.length === 1 ? "atleta" : "atleti"}` : "Atleti"}</span>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem" }}>
          <h1>I tuoi atleti</h1>
          {!actor.assisting && !inviting && (
            <button className="btn ghost" type="button" onClick={() => setInviting(true)}><UserPlus strokeWidth={1.5} aria-hidden="true" />Invita</button>
          )}
        </div>
      </div>
      {inviting && <div className="card" style={{ marginBottom: "1.5rem" }}><InviteForm onDone={() => setInviting(false)} /></div>}
      {error && <div className="notice error">{error}</div>}
      {athletes === null && <p className="muted">Caricamento…</p>}
      {athletes?.length === 0 && !error && <p className="muted">Nessun atleta collegato. Invita il primo atleta per iniziare.</p>}
      {athletes?.length > 0 && (
        <ul className="lines">
          {athletes.map(a => (
            <li key={a.id} style={{ padding: 0 }}>
              <Link to={`/atleti/${a.id}`} style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1, minHeight: 64, color: "inherit", textDecoration: "none" }}>
                <span className="avatar" aria-hidden="true">{initials(a.full_name)}</span>
                <span style={{ flex: 1, fontWeight: a.pending > 0 ? 500 : 400 }}>{a.full_name || "Atleta"}</span>
                {a.pending > 0 && <span className="badge" aria-label={`${a.pending} cose da fare`}>{a.pending}</span>}
                <ChevronRight strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
