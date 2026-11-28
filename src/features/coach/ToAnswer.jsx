import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, MessageCircle } from "lucide-react";
import { supabase } from "../../lib/supabase.js";
import { addDays } from "../../lib/checkinMath.js";
import { formatDay, todayIso } from "../../lib/format.js";

const DAYS = 14;

// Note dell'atleta degli ultimi 14 giorni (pasti, serie, sedute) che il professionista non ha ancora segnato come viste.
export async function loadToAnswer(athleteId, professionalId) {
  const from = addDays(todayIso(), -DAYS);
  const [meals, workouts, reviews] = await Promise.all([
    supabase.from("meal_logs").select("id, day, item_name, status, note, updated_at").eq("athlete_id", athleteId)
      .eq("kind", "meal").neq("note", "").gte("day", from).then(r => r.data || []),
    supabase.from("workout_logs").select("id, performed_on, session_name, status, notes").eq("athlete_id", athleteId)
      .gte("performed_on", from).then(r => r.data || []),
    supabase.from("coach_reviews").select("source, source_id").eq("professional_id", professionalId).then(r => r.data || []),
  ]);
  const byWorkout = new Map(workouts.map(w => [w.id, w]));
  const sets = workouts.length
    ? (await supabase.from("set_logs").select("id, workout_id, exercise_name, set_index, note").in("workout_id", workouts.map(w => w.id)).neq("note", "")).data || []
    : [];
  const seen = new Set(reviews.map(r => `${r.source}:${r.source_id}`));
  const items = [
    ...meals.map(m => ({ source: "meal", id: m.id, day: m.day, title: `${m.item_name || "Pasto"}${m.status === "skipped" ? " · saltato" : ""}`, body: m.note })),
    ...workouts.filter(w => w.notes).map(w => ({ source: "workout", id: w.id, day: w.performed_on, title: `${w.session_name || "Seduta"}${w.status === "skipped" ? " · saltata" : ""}`, body: w.notes })),
    ...sets.map(s => ({ source: "set", id: s.id, day: byWorkout.get(s.workout_id)?.performed_on, title: `${s.exercise_name} · serie ${s.set_index + 1}`, body: s.note })),
  ];
  return items.filter(i => !seen.has(`${i.source}:${i.id}`)).sort((a, b) => (b.day || "").localeCompare(a.day || ""));
}

const dayLabel = iso => (iso === todayIso() ? "oggi" : iso === addDays(todayIso(), -1) ? "ieri" : formatDay(iso));

// "Da rispondere" nella scheda atleta: leggi, rispondi in chat o segna come visto.
export default function ToAnswer({ athleteId, professionalId, chatLinkId, readOnly = false }) {
  const [items, setItems] = useState(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    let active = true;
    loadToAnswer(athleteId, professionalId).then(r => active && setItems(r)).catch(() => active && setItems([]));
    return () => { active = false; };
  }, [athleteId, professionalId]);

  const markSeen = async item => {
    const { error } = await supabase.from("coach_reviews").insert({ professional_id: professionalId, source: item.source, source_id: item.id });
    if (!error) setItems(items.filter(i => i !== item));
  };

  if (!items) return <p className="muted">Caricamento…</p>;
  if (items.length === 0) return <p className="muted" style={{ margin: 0 }}>Nessuna nota nuova dell'atleta su pasti e sedute.</p>;
  const visible = showAll ? items : items.slice(0, 4);
  return (
    <div>
      <ul className="lines">
        {visible.map(item => (
          <li key={`${item.source}:${item.id}`} style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="muted" style={{ fontSize: "0.82rem" }}>{item.title} · {dayLabel(item.day)}</div>
              <div style={{ lineHeight: 1.5 }}>«{item.body}»</div>
            </div>
            {!readOnly && (
              <div style={{ display: "flex", gap: 4, flex: "none" }}>
                {chatLinkId && <Link className="icon-btn" to={`/messaggi/${chatLinkId}`} aria-label="Rispondi in chat" title="Rispondi in chat"><MessageCircle strokeWidth={1.5} aria-hidden="true" /></Link>}
                <button type="button" className="icon-btn" onClick={() => markSeen(item)} aria-label="Segna come vista" title="Segna come vista"><Check strokeWidth={1.5} aria-hidden="true" /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {items.length > 4 && (
        <button type="button" className="btn link" onClick={() => setShowAll(!showAll)}>{showAll ? "Mostra meno" : `Mostra tutte (${items.length})`}</button>
      )}
    </div>
  );
}
