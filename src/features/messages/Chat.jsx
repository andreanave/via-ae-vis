import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Send } from "lucide-react";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { newId } from "../../lib/trainingOutbox.js";

const dayLabel = iso => new Date(iso).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const time = iso => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

// Conversazione di un collegamento: messaggi in tempo reale, segnati come letti all'apertura.
export default function Chat() {
  const { linkId } = useParams();
  const actor = useActor();
  const [link, setLink] = useState(undefined);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef(null);
  const readOnly = actor.assisting;

  const markRead = async () => {
    if (readOnly) return;
    await supabase.from("messages").update({ read_at: new Date().toISOString() })
      .eq("care_link_id", linkId).neq("sender_id", actor.id).is("read_at", null);
    await supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("recipient_id", actor.id).eq("link", `/messaggi/${linkId}`).is("read_at", null);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: l } = await supabase.from("care_links")
        .select("id, status, athlete_id, professional_id, athlete:profiles!care_links_athlete_id_fkey(full_name), professional:profiles!care_links_professional_id_fkey(full_name)")
        .eq("id", linkId).maybeSingle();
      const { data: m } = await supabase.from("messages").select("*").eq("care_link_id", linkId).order("created_at").limit(300);
      if (!active) return;
      setLink(l || null); setMessages(m || []);
      markRead();
    })();
    const channel = supabase.channel(`chat-${linkId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `care_link_id=eq.${linkId}` }, payload => {
        setMessages(list => {
          const row = payload.new;
          if (!row?.id) return list;
          const i = list.findIndex(x => x.id === row.id);
          if (i === -1) return [...list, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
          const next = [...list]; next[i] = { ...next[i], ...row }; return next;
        });
        if (payload.eventType === "INSERT" && payload.new.sender_id !== actor.id) markRead();
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [linkId, actor.id]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const send = async event => {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    const row = { id: newId(), care_link_id: linkId, sender_id: actor.id, body, created_at: new Date().toISOString(), pending: true };
    setMessages(list => [...list, row]); setText(""); setError("");
    const { error: err } = await supabase.from("messages").insert({ id: row.id, care_link_id: linkId, sender_id: actor.id, body });
    if (err) {
      setMessages(list => list.filter(m => m.id !== row.id));
      setText(body);
      setError("Messaggio non inviato. Controlla la connessione e riprova.");
      return;
    }
    setMessages(list => list.map(m => (m.id === row.id ? { ...m, pending: false } : m)));
  };

  if (link === undefined) return <p className="muted">Caricamento…</p>;
  if (link === null) return <div className="notice">Conversazione non trovata. <Link to="/messaggi">Torna ai messaggi</Link></div>;
  const other = actor.id === link.athlete_id ? link.professional : link.athlete;
  const closed = link.status !== "active";

  let lastDay = "";
  return (
    <section style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      <Link to="/messaggi" className="muted" style={{ textDecoration: "none" }}>← Messaggi</Link>
      <h1 style={{ margin: 0 }}>{other?.full_name || "Conversazione"}</h1>
      <div role="log" aria-live="polite" style={{ display: "grid", gap: "0.5rem" }}>
        {messages.length === 0 && <p className="muted">Nessun messaggio. Scrivi il primo.</p>}
        {messages.map(m => {
          const mine = m.sender_id === actor.id;
          const day = dayLabel(m.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id} style={{ display: "grid" }}>
              {showDay && <span className="eyebrow" style={{ justifySelf: "center", margin: "0.75rem 0 0.25rem" }}>{day}</span>}
              <div style={{
                justifySelf: mine ? "end" : "start", maxWidth: "85%", padding: "0.6rem 0.85rem", borderRadius: 14,
                background: mine ? "var(--accent)" : "var(--surface)", color: mine ? "var(--on-accent, #fff)" : "inherit",
                border: mine ? 0 : "1px solid var(--border)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", opacity: m.pending ? 0.6 : 1,
              }}>
                {m.body}
                <span style={{ display: "block", fontSize: "0.75rem", opacity: 0.75, textAlign: "right", marginTop: 2 }}>
                  {m.pending ? "Invio…" : time(m.created_at)}{mine && m.read_at ? " · letto" : ""}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {closed && <div className="notice">Il collegamento è chiuso: puoi leggere i messaggi ma non scriverne di nuovi.</div>}
      {!readOnly && !closed && (
        <form onSubmit={send} style={{ display: "flex", gap: "0.5rem", alignItems: "end", position: "sticky", bottom: 0, padding: "0.5rem 0", background: "var(--bg)" }}>
          <textarea className="input" aria-label="Scrivi un messaggio" placeholder="Scrivi un messaggio" rows={1} value={text}
            style={{ flex: 1, minWidth: 0, padding: "0.75rem", resize: "none", maxHeight: 160 }}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); send(e); } }} />
          <button className="btn" type="submit" disabled={!text.trim()} aria-label="Invia" style={{ minWidth: 52 }}>
            <Send strokeWidth={1.5} aria-hidden="true" />
          </button>
        </form>
      )}
    </section>
  );
}
