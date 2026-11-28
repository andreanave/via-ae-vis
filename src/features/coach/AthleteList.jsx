import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabase.js";
import { MODULE_LABELS } from "../../lib/format.js";

// Atleti seguiti dal professionista, con il numero di cose che lo aspettano (promemoria aperti).
export function useCoachAthletes(professionalId) {
  const [athletes, setAthletes] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      supabase
        .from("care_links")
        .select("modules, athlete:profiles!care_links_athlete_id_fkey(id, full_name)")
        .eq("professional_id", professionalId)
        .eq("status", "active"),
      supabase.from("coach_open_tasks").select("athlete_id, open_count").eq("professional_id", professionalId),
    ]).then(([links, tasks]) => {
      if (!active) return;
      if (links.error) { setError("Non riesco a caricare gli atleti."); setAthletes([]); return; }
      const counts = Object.fromEntries((tasks.data || []).map(t => [t.athlete_id, t.open_count]));
      setAthletes((links.data || [])
        .filter(r => r.athlete)
        .map(r => ({ ...r.athlete, modules: r.modules || [], pending: counts[r.athlete.id] || 0 }))
        .sort((a, b) => b.pending - a.pending || (a.full_name || "").localeCompare(b.full_name || "", "it")));
    });
    return () => { active = false; };
  }, [professionalId]);
  return { athletes, error };
}

const reason = a => a.pending > 0
  ? `${a.pending} ${a.pending === 1 ? "cosa da fare" : "cose da fare"}`
  : a.modules.map(m => MODULE_LABELS[m]).join(" · ");

// Elenco a sinistra della console del coach (design: colonna atleti con ricerca, contatore e badge).
export default function AthleteList({ athletes, current, onInvite }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = (athletes || []).filter(a => !q || (a.full_name || "").toLowerCase().includes(q));
  return (
    <div className="athlete-list">
      <label className="search-pill">
        <Search size={16} strokeWidth={1.5} aria-hidden="true" />
        <input type="search" placeholder="Cerca" aria-label="Cerca un atleta" value={query} onChange={e => setQuery(e.target.value)} />
      </label>
      <div className="athlete-list-head">
        <span className="eyebrow">{athletes ? `${athletes.length} ${athletes.length === 1 ? "atleta" : "atleti"}` : "Atleti"}</span>
        {onInvite && <button type="button" className="btn link" onClick={onInvite}>Invita</button>}
      </div>
      {athletes === null && <p className="muted">Caricamento…</p>}
      <ul className="athlete-items">
        {visible.map(a => (
          <li key={a.id}>
            <Link to={`/atleti/${a.id}`} aria-current={current === a.id ? "page" : undefined}>
              <span className="athlete-item-text">
                <span className="athlete-item-name">{a.full_name || "Atleta"}</span>
                <span className="muted">{reason(a)}</span>
              </span>
              {a.pending > 0 && <span className="count-badge num" aria-hidden="true">{a.pending}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {athletes && q && visible.length === 0 && <p className="muted hint">Nessun atleta con questo nome.</p>}
    </div>
  );
}
