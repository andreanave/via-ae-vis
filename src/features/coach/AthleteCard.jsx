import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { MODULE_LABELS, initials } from "../../lib/format.js";
import TaskList from "./TaskList.jsx";
import CheckinSummary from "../checkin/CheckinSummary.jsx";
import CheckinSettingsEditor from "../checkin/CheckinSettingsEditor.jsx";

// Scheda dell'atleta vista dal professionista: nota generale, promemoria, collegamento Telegram.
// Check-in, allenamento e alimentazione si aggiungono qui nelle fasi successive.
export default function AthleteCard() {
  const { id } = useParams();
  const actor = useActor();
  const [athlete, setAthlete] = useState(undefined);
  const [link, setLink] = useState(null);
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState("idle"); // idle | saving | saved | error
  const [telegram, setTelegram] = useState("");
  const savedNote = useRef("");
  const readOnly = actor.assisting;
  const [checkinTab, setCheckinTab] = useState("summary");
  const [checkinVersion, setCheckinVersion] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("profiles").select("id, full_name").eq("id", id).maybeSingle(),
      supabase.from("care_links").select("id, modules, telegram_url, started_at")
        .eq("athlete_id", id).eq("professional_id", actor.id).maybeSingle(),
      supabase.from("coach_notes").select("body").eq("athlete_id", id).eq("professional_id", actor.id).maybeSingle(),
    ]).then(([p, l, n]) => {
      if (!active) return;
      setAthlete(p.data || null);
      setLink(l.data || null);
      setTelegram(l.data?.telegram_url || "");
      savedNote.current = n.data?.body || "";
      setNote(savedNote.current);
    });
    return () => { active = false; };
  }, [id, actor.id]);

  const saveNote = async () => {
    if (readOnly || note === savedNote.current) return;
    setNoteState("saving");
    const { error } = await supabase.from("coach_notes")
      .upsert({ athlete_id: id, professional_id: actor.id, body: note, updated_at: new Date().toISOString() });
    if (error) { setNoteState("error"); return; }
    savedNote.current = note;
    setNoteState("saved");
  };

  const telegramValid = !telegram || /^https:\/\/(t\.me|telegram\.me)\//.test(telegram.trim());
  const saveTelegram = async () => {
    if (readOnly || !link || !telegramValid || (telegram.trim() || null) === link.telegram_url) return;
    const value = telegram.trim() || null;
    const { error } = await supabase.from("care_links").update({ telegram_url: value }).eq("id", link.id);
    if (!error) setLink({ ...link, telegram_url: value });
  };

  if (athlete === undefined) return <p className="muted">Caricamento…</p>;
  if (!athlete || !link) {
    return (
      <section>
        <p>Questo atleta non è tra quelli che segui.</p>
        <Link to="/">Torna agli atleti</Link>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <Link to="/" className="muted" style={{ textDecoration: "none" }}>← Atleti</Link>
      <div style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
        <span className="avatar" aria-hidden="true" style={{ width: 52, height: 52, fontSize: "1.1rem" }}>{initials(athlete.full_name)}</span>
        <div>
          <h1 style={{ margin: 0 }}>{athlete.full_name || "Atleta"}</h1>
          <span className="muted">{link.modules.map(m => MODULE_LABELS[m]).join(" · ")}</span>
        </div>
        {link.telegram_url && (
          <a className="btn secondary" style={{ marginLeft: "auto" }} href={link.telegram_url} target="_blank" rel="noreferrer">Telegram</a>
        )}
      </div>

      {link.modules.includes("checkin") && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Check-in</h2>
            <div role="tablist" style={{ display: "flex", gap: 4 }}>
              {[["summary", "Resoconto"], ["settings", "Cosa chiedere"]].map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={checkinTab === key}
                  className={checkinTab === key ? "btn secondary" : "btn ghost"} onClick={() => setCheckinTab(key)}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            {checkinTab === "summary"
              ? <CheckinSummary athleteId={id} refreshKey={checkinVersion} />
              : <CheckinSettingsEditor athleteId={id} readOnly={readOnly} onSaved={() => setCheckinVersion(v => v + 1)} />}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Cose da fare</h2>
        <TaskList professionalId={actor.id} athleteId={id} readOnly={readOnly} />
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>Nota generale</h2>
          <span className="muted" role="status" style={{ fontSize: "0.9rem" }}>
            {noteState === "saving" ? "Salvataggio…" : noteState === "saved" ? "Salvata" : noteState === "error" ? "Non salvata, riprova" : ""}
          </span>
        </div>
        <p className="muted" style={{ fontSize: "0.9rem" }}>Visibile solo a te. Per scrivere all'atleta usa la chat.</p>
        <textarea className="input" rows={6} style={{ width: "100%", padding: "0.75rem", resize: "vertical" }}
          aria-label="Nota generale sull'atleta" value={note} readOnly={readOnly}
          onChange={e => { setNote(e.target.value); setNoteState("idle"); }} onBlur={saveNote} />
      </div>

      <div className="card">
        <h2>Chat Telegram per i video</h2>
        <div className={`field${telegramValid ? "" : " invalid"}`} style={{ marginBottom: 0 }}>
          <label htmlFor="tg">Link alla chat (facoltativo)</label>
          <input id="tg" className="input" placeholder="https://t.me/…" value={telegram} readOnly={readOnly}
            aria-invalid={!telegramValid} onChange={e => setTelegram(e.target.value)} onBlur={saveTelegram} />
          {!telegramValid && <span className="error">Il link deve iniziare con https://t.me/</span>}
        </div>
      </div>
    </section>
  );
}
