import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";

const when = iso => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Elenco delle notifiche: un tocco apre la pagina collegata e segna come letta.
export default function NotificationsPage() {
  const actor = useActor();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  const load = () => supabase.from("notifications").select("*").eq("recipient_id", actor.id)
    .order("created_at", { ascending: false }).limit(100).then(({ data }) => setItems(data || []));
  useEffect(() => { load(); }, [actor.id]);

  const open = async n => {
    if (!n.read_at && !actor.assisting) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    navigate(n.link || "/");
  };
  const readAll = async () => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", actor.id).is("read_at", null);
    load();
  };
  const unread = (items || []).filter(n => !n.read_at).length;

  return (
    <section className="page narrow">
      <div className="section-head">
        <div className="page-head">
          <span className="eyebrow">{unread ? `${unread} da leggere` : "Tutto letto"}</span>
          <h1>Notifiche</h1>
        </div>
        {unread > 0 && !actor.assisting && <button type="button" className="btn link" onClick={readAll}>Segna come lette</button>}
      </div>
      {items === null && <p className="muted">Caricamento…</p>}
      {items?.length === 0 && <div className="notice">Nessuna notifica.</div>}
      {items?.length > 0 && (
        <ul className="lines">
          {items.map(n => (
            <li key={n.id} className={`convo${n.read_at ? "" : " unread"}`}>
              <button type="button" onClick={() => open(n)}>
                <span aria-hidden="true" className="unread-dot" />
                <span className="convo-text">
                  <span className="convo-name">{n.title}{n.read_at ? "" : <span className="sr-only"> (non letta)</span>}</span>
                  {n.body && <span className="muted convo-last">{n.body}</span>}
                </span>
                <span className="muted num convo-time">{when(n.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
