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
    <section style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <h1 style={{ margin: 0, flex: 1 }}>Notifiche</h1>
        {unread > 0 && !actor.assisting && <button type="button" className="btn ghost" onClick={readAll}>Segna come lette</button>}
      </div>
      {items === null && <p className="muted">Caricamento…</p>}
      {items?.length === 0 && <div className="notice">Nessuna notifica.</div>}
      {items?.length > 0 && (
        <ul className="lines">
          {items.map(n => (
            <li key={n.id} style={{ padding: 0, minWidth: 0 }}>
              <button type="button" onClick={() => open(n)}
                style={{ display: "flex", gap: "0.75rem", alignItems: "center", width: "100%", minHeight: 64, padding: "0.5rem 0", background: "none", border: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, flex: "0 0 8px", background: n.read_at ? "transparent" : "var(--accent)" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: n.read_at ? undefined : 600 }}>{n.title}{n.read_at ? "" : <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}> (non letta)</span>}</span>
                  {n.body && <span className="muted" style={{ display: "block", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</span>}
                </span>
                <span className="muted" style={{ fontSize: "0.85rem" }}>{when(n.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
