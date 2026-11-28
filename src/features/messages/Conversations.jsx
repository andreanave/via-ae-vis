import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { MODULE_LABELS, initials } from "../../lib/format.js";

const when = iso => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};

// Elenco delle chat: una per ogni collegamento attivo atleta-professionista.
export default function Conversations() {
  const actor = useActor();
  const [items, setItems] = useState(null);
  const isProfessional = actor.role === "professional" || actor.isMaster;

  useEffect(() => {
    let active = true;
    (async () => {
      const mine = isProfessional ? "professional_id" : "athlete_id";
      const other = isProfessional ? "athlete:profiles!care_links_athlete_id_fkey(id, full_name)" : "professional:profiles!care_links_professional_id_fkey(id, full_name)";
      const { data: links } = await supabase.from("care_links").select(`id, modules, ${other}`).eq(mine, actor.id).eq("status", "active");
      const ids = (links || []).map(l => l.id);
      const { data: msgs } = ids.length
        ? await supabase.from("messages").select("care_link_id, sender_id, body, created_at, read_at").in("care_link_id", ids).order("created_at", { ascending: false }).limit(500)
        : { data: [] };
      const list = (links || []).map(l => {
        const person = l.athlete || l.professional;
        const own = (msgs || []).filter(m => m.care_link_id === l.id);
        return {
          id: l.id, person, modules: l.modules, last: own[0] || null,
          unread: own.filter(m => m.sender_id !== actor.id && !m.read_at).length,
        };
      }).sort((a, b) => (b.last?.created_at || "").localeCompare(a.last?.created_at || "") || (a.person?.full_name || "").localeCompare(b.person?.full_name || ""));
      if (active) setItems(list);
    })().catch(() => active && setItems([]));
    return () => { active = false; };
  }, [actor.id, isProfessional]);

  return (
    <section className="page narrow">
      <div className="page-head">
        <span className="eyebrow">{items ? (items.length === 1 ? "1 conversazione" : `${items.length} conversazioni`) : "Chat"}</span>
        <h1>Messaggi</h1>
      </div>
      {items === null && <p className="muted">Caricamento…</p>}
      {items?.length === 0 && <div className="notice">{isProfessional ? "Nessun atleta collegato." : "Nessun professionista collegato."}</div>}
      {items?.length > 0 && (
        <ul className="lines">
          {items.map(c => (
            <li key={c.id} className={`convo${c.unread ? " unread" : ""}`}>
              <Link to={`/messaggi/${c.id}`}>
                <span className="avatar" aria-hidden="true">{initials(c.person?.full_name)}</span>
                <span className="convo-text">
                  <span className="convo-name">{c.person?.full_name || "Senza nome"}</span>
                  <span className="muted convo-last">
                    {c.last ? `${c.last.sender_id === actor.id ? "Tu: " : ""}${c.last.body}` : c.modules.map(m => MODULE_LABELS[m]).join(" · ")}
                  </span>
                </span>
                {c.last && <span className="muted num convo-time">{when(c.last.created_at)}</span>}
                {c.unread > 0 && <span className="badge" aria-label={`${c.unread} da leggere`}>{c.unread}</span>}
                <ChevronRight strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
