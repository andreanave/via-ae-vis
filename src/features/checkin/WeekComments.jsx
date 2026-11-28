import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useActor } from "../../lib/assist.jsx";
import { FIELD_BY_KEY } from "../../lib/checkinFields.js";

const when = iso => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Commenti e domande del professionista su una settimana; l'atleta risponde nello stesso punto.
export default function WeekComments({ weeklyId, athleteId, fieldKeys = [] }) {
  const { user } = useAuth();
  const actor = useActor();
  const [items, setItems] = useState([]);
  const [names, setNames] = useState({});
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("comment");
  const [fieldKey, setFieldKey] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState("");
  const isAthlete = actor.id === athleteId;
  const canWrite = !actor.assisting;

  const load = async () => {
    const { data } = await supabase.from("checkin_comments")
      .select("id, author_id, field_key, kind, reply_to, body, created_at, author:profiles!checkin_comments_author_id_fkey(full_name)")
      .eq("weekly_checkin_id", weeklyId).order("created_at");
    setItems(data || []);
    setNames(Object.fromEntries((data || []).map(c => [c.author_id, c.author?.full_name || ""])));
  };
  useEffect(() => { load(); }, [weeklyId]);

  const post = async (row, done) => {
    const { error: err } = await supabase.from("checkin_comments").insert({ weekly_checkin_id: weeklyId, author_id: user.id, ...row });
    if (err) { setError("Non riesco a inviare. Riprova."); return; }
    setError(""); done(); load();
  };

  const roots = items.filter(c => !c.reply_to);
  const repliesOf = id => items.filter(c => c.reply_to === id);
  if (!isAthlete && roots.length === 0 && !canWrite) return null;
  if (isAthlete && roots.length === 0) return null;

  return (
    <section className="comments">
      <h2 className="eyebrow">{isAthlete ? "Dal tuo coach" : "Commenti e domande"}</h2>
      {error && <div className="notice error" role="alert">{error}</div>}
      {roots.map(c => (
        <div key={c.id} className="comment">
          <div className="muted meta">
            {c.kind === "question" ? "Domanda" : "Commento"}
            {c.field_key ? ` su ${FIELD_BY_KEY[c.field_key]?.label.toLowerCase()}` : ""} · {names[c.author_id] || "Coach"} · {when(c.created_at)}
          </div>
          <p>{c.body}</p>
          {repliesOf(c.id).map(r => (
            <div key={r.id} className="reply">
              <div className="muted meta">Risposta · {when(r.created_at)}</div>
              {r.body}
            </div>
          ))}
          {isAthlete && canWrite && c.kind === "question" && repliesOf(c.id).length === 0 && (
            replyTo === c.id ? (
              <form onSubmit={e => { e.preventDefault(); if (replyText.trim()) post({ kind: "answer", reply_to: c.id, body: replyText.trim() }, () => { setReplyText(""); setReplyTo(null); }); }}
                className="comment-form">
                <textarea className="input" rows={2} aria-label="La tua risposta"
                  value={replyText} onChange={e => setReplyText(e.target.value)} />
                <button className="btn" type="submit" disabled={!replyText.trim()}>Rispondi</button>
              </form>
            ) : (
              <button type="button" className="btn link" onClick={() => setReplyTo(c.id)}>Rispondi</button>
            )
          )}
        </div>
      ))}
      {!isAthlete && canWrite && (
        <form onSubmit={e => { e.preventDefault(); if (body.trim()) post({ kind, body: body.trim(), field_key: fieldKey || null }, () => setBody("")); }}
          className="comment-form">
          <div className="actions">
            <select className="input" aria-label="Tipo" value={kind} onChange={e => setKind(e.target.value)}>
              <option value="comment">Commento</option>
              <option value="question">Domanda all'atleta</option>
            </select>
            <select className="input" aria-label="Riferito a" value={fieldKey} onChange={e => setFieldKey(e.target.value)}>
              <option value="">Tutta la settimana</option>
              {fieldKeys.map(k => <option key={k} value={k}>{FIELD_BY_KEY[k]?.label}</option>)}
            </select>
          </div>
          <textarea className="input" rows={3} aria-label="Testo" value={body} onChange={e => setBody(e.target.value)} />
          <button className="btn" type="submit" disabled={!body.trim()}>
            {kind === "question" ? "Invia la domanda" : "Aggiungi il commento"}
          </button>
        </form>
      )}
    </section>
  );
}
