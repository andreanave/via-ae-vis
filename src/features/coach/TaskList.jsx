import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { formatDay, todayIso } from "../../lib/format.js";

// Promemoria del coach. Con athleteId: quelli di un atleta (e se ne possono aggiungere).
// Senza: l'agenda completa del coach.
export default function TaskList({ professionalId, athleteId, athleteNames = {}, readOnly = false }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    let q = supabase.from("coach_tasks").select("id, title, due_on, done_at, athlete_id")
      .eq("professional_id", professionalId).is("done_at", null)
      .order("due_on", { ascending: true, nullsFirst: false }).order("created_at");
    if (athleteId) q = q.eq("athlete_id", athleteId);
    const { data, error: err } = await q;
    if (err) setError("Non riesco a caricare i promemoria.");
    setTasks(data || []);
  };
  useEffect(() => { load(); }, [professionalId, athleteId]);

  const add = async event => {
    event.preventDefault();
    if (!title.trim()) return;
    const { error: err } = await supabase.from("coach_tasks")
      .insert({ professional_id: user.id, athlete_id: athleteId || null, title: title.trim(), due_on: due || null });
    if (err) { setError("Non riesco a salvare il promemoria."); return; }
    setTitle(""); setDue(""); setError(""); load();
  };

  const complete = async id => {
    setTasks(cur => cur.filter(t => t.id !== id));
    const { error: err } = await supabase.from("coach_tasks").update({ done_at: new Date().toISOString() }).eq("id", id);
    if (err) { setError("Non riesco a segnarlo come fatto."); load(); }
  };

  const today = todayIso();
  return (
    <div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {!readOnly && (
        <form onSubmit={add} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <input className="input" style={{ flex: "1 1 220px" }} placeholder="Es. aggiornare la prossima scheda"
            aria-label="Nuovo promemoria" value={title} onChange={e => setTitle(e.target.value)} />
          <input className="input" type="date" aria-label="Scadenza (facoltativa)" value={due} onChange={e => setDue(e.target.value)} />
          <button className="btn" type="submit" disabled={!title.trim()}>Aggiungi</button>
        </form>
      )}
      {tasks === null && <p className="muted">Caricamento…</p>}
      {tasks?.length === 0 && <p className="muted">Niente in sospeso.</p>}
      <ul className="list">
        {tasks?.map(t => (
          <li key={t.id} className="row" style={{ minHeight: 56 }}>
            {!readOnly && (
              <input type="checkbox" aria-label={`Segna come fatto: ${t.title}`} onChange={() => complete(t.id)}
                style={{ width: 22, height: 22, flex: "none" }} />
            )}
            <span style={{ flex: 1 }}>
              {t.title}
              {!athleteId && t.athlete_id && <span className="muted"> · {athleteNames[t.athlete_id] || "Atleta"}</span>}
            </span>
            {t.due_on && (
              <span className="muted" style={{ color: t.due_on < today ? "var(--danger)" : undefined, whiteSpace: "nowrap" }}>
                {t.due_on < today ? "Scaduto " : ""}{formatDay(t.due_on)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
