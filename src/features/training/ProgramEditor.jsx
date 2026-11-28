import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { newId } from "../../lib/trainingOutbox.js";
import { WEEKDAYS } from "../../lib/checkinFields.js";
import { todayIso } from "../../lib/format.js";
import { cloneProgram, emptyExercise, loadCatalog, loadProgram, saveProgram } from "./trainingApi.js";
import WorkoutHistory from "./WorkoutHistory.jsx";

const STATUS = { draft: "Bozza", active: "Attiva", archived: "Archiviata" };
const LETTERS = "ABCDEFGHIJ";
// Lunedì primo nella scelta dei giorni.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const newProgram = (athleteId, professionalId) => ({
  id: newId(), athlete_id: athleteId, professional_id: professionalId, name: "Scheda", notes: "",
  training_weekdays: [1, 3, 5], status: "draft", starts_on: todayIso(),
  sessions: [{ id: newId(), name: "Seduta A", notes: "", exercises: [emptyExercise()] }],
});

const move = (list, i, d) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

// Il professionista scrive la scheda: sedute in rotazione, esercizi, giorni di allenamento.
export default function ProgramEditor() {
  const { id: athleteId } = useParams();
  const actor = useActor();
  const readOnly = actor.assisting;
  const [athlete, setAthlete] = useState(null);
  const [programs, setPrograms] = useState(undefined);
  const [catalog, setCatalog] = useState([]);
  const [draft, setDraft] = useState(null);
  const [original, setOriginal] = useState(null);
  const [tab, setTab] = useState("program");
  const [state, setState] = useState("idle"); // idle | dirty | saving | saved | error
  const [message, setMessage] = useState("");
  const [openDetails, setOpenDetails] = useState({});

  const loadList = async () => {
    const { data } = await supabase.from("programs").select("id, name, status, starts_on, updated_at")
      .eq("athlete_id", athleteId).order("created_at", { ascending: false });
    setPrograms(data || []);
    return data || [];
  };

  const open = async programId => {
    const p = await loadProgram(programId);
    setOriginal(p); setDraft(structuredClone(p)); setState("idle"); setMessage("");
  };

  useEffect(() => {
    supabase.from("profiles").select("id, full_name").eq("id", athleteId).maybeSingle().then(({ data }) => setAthlete(data));
    loadCatalog(actor.id).then(setCatalog).catch(() => {});
    loadList().then(list => {
      const first = list.find(p => p.status === "active") || list[0];
      if (first) open(first.id);
    });
  }, [athleteId, actor.id]);

  const byName = useMemo(() => Object.fromEntries(catalog.map(c => [c.name.toLowerCase(), c])), [catalog]);

  const update = fn => { setDraft(d => { const next = structuredClone(d); fn(next); return next; }); setState("dirty"); };
  const updateEx = (si, ei, patch) => update(d => { Object.assign(d.sessions[si].exercises[ei], patch); });

  const setName = (si, ei, name) => {
    const hit = byName[name.trim().toLowerCase()];
    updateEx(si, ei, hit
      ? { name: hit.name, exercise_id: hit.id, video_url: hit.video_url || "", bodyweight: hit.bodyweight, load: hit.bodyweight && !draft.sessions[si].exercises[ei].load ? "Corpo libero" : draft.sessions[si].exercises[ei].load }
      : { name, exercise_id: null });
  };

  const save = async () => {
    setState("saving"); setMessage("");
    try {
      await saveProgram(draft, original);
      const fresh = await loadProgram(draft.id);
      setOriginal(fresh); setDraft(structuredClone(fresh)); setState("saved");
      await loadList();
      return true;
    } catch {
      setState("error"); setMessage("Non riesco a salvare la scheda. Controlla la connessione e riprova.");
      return false;
    }
  };

  const activate = async () => {
    if (state === "dirty" && !(await save())) return;
    const { error } = await supabase.rpc("activate_program", { program: draft.id });
    if (error) { setMessage("Non riesco ad attivare la scheda."); return; }
    await open(draft.id); await loadList();
    setMessage("Scheda attiva: l'atleta la vede da subito. La precedente è archiviata.");
  };

  const archive = async () => {
    const { error } = await supabase.from("programs").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", draft.id);
    if (!error) { await open(draft.id); await loadList(); }
  };

  const startNew = source => {
    const p = source ? cloneProgram(source) : newProgram(athleteId, actor.id);
    p.professional_id = actor.id;
    setOriginal(null); setDraft(p); setState("dirty"); setTab("program"); setMessage("");
  };

  return (
    <section style={{ display: "grid", gap: "1rem", maxWidth: 860 }}>
      <Link to={`/atleti/${athleteId}`} className="muted" style={{ textDecoration: "none" }}>← {athlete?.full_name || "Atleta"}</Link>
      <h1 style={{ margin: 0 }}>Allenamento</h1>

      <div role="tablist" style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" role="tab" aria-selected={tab === "program"} className={`btn${tab === "program" ? "" : " ghost"}`} onClick={() => setTab("program")}>Scheda</button>
        <button type="button" role="tab" aria-selected={tab === "history"} className={`btn${tab === "history" ? "" : " ghost"}`} onClick={() => setTab("history")}>Sedute svolte</button>
      </div>

      {tab === "history" && <WorkoutHistory athleteId={athleteId} />}

      {tab === "program" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {programs?.length > 0 && (
              <select className="input" aria-label="Scegli la scheda" value={draft && original ? draft.id : ""} style={{ flex: 1, minWidth: 200 }}
                onChange={e => e.target.value && open(e.target.value)}>
                {!original && <option value="">Nuova scheda (non salvata)</option>}
                {programs.map(p => <option key={p.id} value={p.id}>{p.name} · {STATUS[p.status]}</option>)}
              </select>
            )}
            {!readOnly && <button className="btn ghost" type="button" onClick={() => startNew(null)}>Nuova scheda</button>}
            {!readOnly && original && <button className="btn ghost" type="button" onClick={() => startNew(original)}>Duplica</button>}
            <Link className="btn ghost" to="/esercizi">Catalogo esercizi</Link>
          </div>

          {programs?.length === 0 && !draft && (
            <div className="notice">Nessuna scheda per questo atleta. {!readOnly && "Creane una con “Nuova scheda”."}</div>
          )}
          {programs === undefined && <p className="muted">Caricamento…</p>}

          {draft && (
            <div style={{ display: "grid", gap: "1rem" }}>
              {message && <div className={`notice${state === "error" ? " error" : ""}`} role="status">{message}</div>}
              <div className="card" style={{ display: "grid", gap: "0.75rem", marginBottom: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span className="badge">{STATUS[draft.status] || "Bozza"}</span>
                  <span className="muted" style={{ fontSize: "0.9rem" }}>
                    {state === "dirty" ? "Modifiche non salvate" : state === "saving" ? "Salvataggio…" : state === "saved" ? "Salvata" : ""}
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="p-name">Nome della scheda</label>
                  <input id="p-name" className="input" style={{ width: "100%", minWidth: 0 }} readOnly={readOnly} value={draft.name} onChange={e => update(d => { d.name = e.target.value; })} />
                </div>
                <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend style={{ marginBottom: "0.5rem" }}>Giorni di allenamento</legend>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                    {WEEK_ORDER.map(d => {
                      const on = draft.training_weekdays.includes(d);
                      return (
                        <button key={d} type="button" aria-pressed={on} disabled={readOnly} className={`btn${on ? "" : " ghost"}`} style={{ minWidth: 56 }}
                          onClick={() => update(p => { p.training_weekdays = on ? p.training_weekdays.filter(x => x !== d) : [...p.training_weekdays, d].sort(); })}>
                          {WEEKDAYS[d].slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                  <span className="muted" style={{ fontSize: "0.9rem" }}>
                    Le sedute si alternano in ordine sui giorni scelti. Se l'atleta salta un giorno, la seduta non va persa: slitta al successivo.
                  </span>
                </fieldset>
                <div className="field">
                  <label htmlFor="p-notes">Note generali per l'atleta</label>
                  <textarea id="p-notes" className="input" rows={3} style={{ minWidth: 0, padding: "0.75rem" }} readOnly={readOnly} value={draft.notes}
                    onChange={e => update(d => { d.notes = e.target.value; })} />
                </div>
              </div>

              <datalist id="catalog-names">{catalog.map(c => <option key={c.id} value={c.name} />)}</datalist>

              {draft.sessions.map((s, si) => (
                <div key={s.id} className="card" style={{ display: "grid", gap: "0.75rem", marginBottom: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <input className="input" aria-label="Nome della seduta" readOnly={readOnly} style={{ flex: 1, minWidth: 160, fontWeight: 600 }}
                      value={s.name} onChange={e => update(d => { d.sessions[si].name = e.target.value; })} />
                    {!readOnly && (
                      <>
                        <button type="button" className="btn ghost" aria-label="Sposta la seduta prima" onClick={() => update(d => { d.sessions = move(d.sessions, si, -1); })}>↑</button>
                        <button type="button" className="btn ghost" aria-label="Sposta la seduta dopo" onClick={() => update(d => { d.sessions = move(d.sessions, si, 1); })}>↓</button>
                        <button type="button" className="btn ghost" onClick={() => update(d => { d.sessions.splice(si, 1); })}>Elimina seduta</button>
                      </>
                    )}
                  </div>
                  <textarea className="input" aria-label="Note della seduta" placeholder="Note della seduta (riscaldamento, indicazioni…)" rows={2}
                    style={{ minWidth: 0, padding: "0.75rem" }} readOnly={readOnly} value={s.notes} onChange={e => update(d => { d.sessions[si].notes = e.target.value; })} />

                  {s.exercises.map((ex, ei) => {
                    const key = ex.id;
                    const fid = f => `ex-${ex.id}-${f}`;
                    return (
                      <div key={key} style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <input className="input" aria-label="Gruppo (es. A1)" placeholder="A1" readOnly={readOnly} style={{ minWidth: 0, width: 64 }}
                            value={ex.group_label || ""} onChange={e => updateEx(si, ei, { group_label: e.target.value })} />
                          <input className="input" list="catalog-names" aria-label="Esercizio" placeholder="Esercizio" readOnly={readOnly} style={{ flex: 1, minWidth: 180 }}
                            value={ex.name} onChange={e => setName(si, ei, e.target.value)} />
                          {!readOnly && (
                            <>
                              <button type="button" className="btn ghost" aria-label="Sposta l'esercizio prima" onClick={() => update(d => { d.sessions[si].exercises = move(d.sessions[si].exercises, ei, -1); })}>↑</button>
                              <button type="button" className="btn ghost" aria-label="Sposta l'esercizio dopo" onClick={() => update(d => { d.sessions[si].exercises = move(d.sessions[si].exercises, ei, 1); })}>↓</button>
                              <button type="button" className="btn ghost" aria-label="Togli l'esercizio" onClick={() => update(d => { d.sessions[si].exercises.splice(ei, 1); })}>✕</button>
                            </>
                          )}
                        </div>
                        <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
                          {[["sets", "Serie", "numeric"], ["reps", "Ripetizioni", "text"], ["load", "Carico", "text"], ["tempo", "Tempo (TUT)", "text"], ["rir", "RIR", "text"], ["rest_seconds", "Recupero (s)", "numeric"]].map(([f, label, mode]) => (
                            <div key={f} className="field" style={{ margin: 0, minWidth: 0 }}>
                              <label htmlFor={fid(f)} style={{ fontSize: "0.85rem" }}>{label}</label>
                              <input id={fid(f)} className="input" style={{ width: "100%", minWidth: 0 }} inputMode={mode} readOnly={readOnly} value={ex[f] ?? ""}
                                onChange={e => updateEx(si, ei, { [f]: mode === "numeric" ? e.target.value.replace(/[^\d]/g, "") : e.target.value })} />
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                          <input className="input" style={{ width: "100%", minWidth: 0 }} aria-label="Note dell'esercizio" placeholder="Note (tecnica, varianti…)" readOnly={readOnly}
                            value={ex.notes} onChange={e => updateEx(si, ei, { notes: e.target.value })} />
                          <input className="input" style={{ width: "100%", minWidth: 0 }} aria-label="Cosa filmare" placeholder="Da filmare (es. ultima serie di lato)" readOnly={readOnly}
                            value={ex.film} onChange={e => updateEx(si, ei, { film: e.target.value })} />
                          <input className="input" style={{ width: "100%", minWidth: 0 }} aria-label="Link al video" placeholder="Link al video https://" inputMode="url" readOnly={readOnly}
                            value={ex.video_url || ""} onChange={e => updateEx(si, ei, { video_url: e.target.value })} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <input type="checkbox" disabled={readOnly} checked={ex.bodyweight} onChange={e => updateEx(si, ei, { bodyweight: e.target.checked })} />
                            Corpo libero
                          </label>
                          <button type="button" className="btn ghost" aria-expanded={Boolean(openDetails[key])}
                            onClick={() => setOpenDetails({ ...openDetails, [key]: !openDetails[key] })}>
                            {openDetails[key] ? "Nascondi serie per serie" : `Serie per serie${ex.set_details?.some(x => x && Object.values(x).some(Boolean)) ? " (impostate)" : ""}`}
                          </button>
                        </div>
                        {openDetails[key] && (
                          <div style={{ display: "grid", gap: "0.4rem" }}>
                            <span className="muted" style={{ fontSize: "0.9rem" }}>Lascia vuoto per usare i valori generali.</span>
                            {Array.from({ length: Number(ex.sets) || 1 }, (_, i) => {
                              const d = ex.set_details?.[i] || {};
                              const set = (field, value) => {
                                const details = Array.from({ length: Number(ex.sets) || 1 }, (_, k) => ({ ...(ex.set_details?.[k] || {}) }));
                                details[i][field] = value;
                                updateEx(si, ei, { set_details: details });
                              };
                              return (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                                  <span style={{ width: 64 }}>Serie {i + 1}</span>
                                  <input className="input" aria-label={`Ripetizioni serie ${i + 1}`} placeholder={ex.reps || "Rip."} style={{ minWidth: 0, width: 90 }} readOnly={readOnly} value={d.reps || ""} onChange={e => set("reps", e.target.value)} />
                                  <input className="input" aria-label={`Carico serie ${i + 1}`} placeholder={ex.load || "Carico"} style={{ minWidth: 0, width: 110 }} readOnly={readOnly} value={d.load || ""} onChange={e => set("load", e.target.value)} />
                                  <input className="input" aria-label={`RIR serie ${i + 1}`} placeholder={ex.rir || "RIR"} style={{ minWidth: 0, width: 70 }} readOnly={readOnly} value={d.rir || ""} onChange={e => set("rir", e.target.value)} />
                                  <input className="input" aria-label={`Nota serie ${i + 1}`} placeholder="Nota" style={{ flex: 1, minWidth: 120 }} readOnly={readOnly} value={d.note || ""} onChange={e => set("note", e.target.value)} />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!readOnly && (
                    <button type="button" className="btn ghost" style={{ justifySelf: "start" }}
                      onClick={() => update(d => { d.sessions[si].exercises.push(emptyExercise()); })}>Aggiungi esercizio</button>
                  )}
                </div>
              ))}

              {!readOnly && (
                <button type="button" className="btn ghost" style={{ justifySelf: "start" }}
                  onClick={() => update(d => { d.sessions.push({ id: newId(), name: `Seduta ${LETTERS[d.sessions.length] || d.sessions.length + 1}`, notes: "", exercises: [emptyExercise()] }); })}>
                  Aggiungi seduta
                </button>
              )}

              {!readOnly && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", position: "sticky", bottom: 0, padding: "0.75rem 0", background: "var(--bg)" }}>
                  <button className="btn" type="button" onClick={save} disabled={state === "saving" || !draft.sessions.length}>Salva</button>
                  {draft.status !== "active" && <button className="btn secondary" type="button" onClick={activate} disabled={state === "saving" || !draft.sessions.length}>Salva e attiva</button>}
                  {draft.status === "active" && <button className="btn ghost" type="button" onClick={archive}>Archivia</button>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
