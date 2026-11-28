import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { newId } from "../../lib/trainingOutbox.js";
import { groupBlocks, previousSets, setTarget } from "../../lib/trainingRotation.js";
import { parseNumber } from "../checkin/FieldInput.jsx";
import { useTrainingData } from "./useTrainingData.js";
import RestTimer, { readRest, writeRest } from "./RestTimer.jsx";
import SyncNotice from "./SyncNotice.jsx";
import { ArrowLeft, ArrowRight, Check, Info, Pencil, PlayCircle, Video, X } from "lucide-react";
import { setGymMode } from "../../ui/theme.js";

const num = v => (v === null || v === undefined || v === "" ? "" : String(v).replace(".", ","));

// Seduta in palestra: funziona senza rete, salva ogni serie sul telefono e la invia appena può.
export default function GymSession() {
  const { workoutId } = useParams();
  const actor = useActor();
  const navigate = useNavigate();
  const data = useTrainingData(actor.id);
  const { outbox } = data;
  const [entry, setEntry] = useState(() => outbox.get(workoutId));
  const [rest, setRestState] = useState(readRest);
  const [noteOpen, setNoteOpen] = useState({});
  const [infoOpen, setInfoOpen] = useState({});
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [step, setStep] = useState(null);
  const timer = useRef(null);
  const readOnly = actor.assisting || entry?.workout?.status === "done";

  // Seduta aperta su un altro dispositivo: la scarica e la mette nella coda locale.
  useEffect(() => {
    if (entry) return;
    (async () => {
      const { data: w } = await supabase.from("workout_logs").select("*").eq("id", workoutId).maybeSingle();
      if (!w) { setEntry(null); return; }
      const { data: sets } = await supabase.from("set_logs").select("*").eq("workout_id", workoutId);
      if (actor.assisting || w.status !== "in_progress") {
        setEntry({ workout: w, sets: Object.fromEntries((sets || []).map(s => [s.id, s])) });
        return;
      }
      outbox.putWorkout(w);
      for (const s of sets || []) outbox.putSet(workoutId, s);
      setEntry(outbox.get(workoutId));
    })().catch(() => setEntry(null));
  }, [workoutId]);

  const setRest = useCallback(value => { writeRest(value); setRestState(value); }, []);

  const scheduleSync = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => data.sync(), 800);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setGymMode(true); return () => setGymMode(false); }, []);

  const session = useMemo(() => data.program?.sessions.find(s => s.id === entry?.workout?.session_id), [data.program, entry]);
  const catalog = useMemo(() => Object.fromEntries((data.catalog || []).map(c => [c.id, c])), [data.catalog]);
  const blocks = useMemo(() => groupBlocks(session?.exercises || []), [session]);

  if (entry === undefined || (data.loading && !data.program)) return <p className="muted">Caricamento…</p>;
  if (entry === null) return <div className="notice">Seduta non trovata. <Link to="/allenamento">Torna all'allenamento</Link></div>;

  const w = entry.workout;
  const findSet = (ex, i) => Object.values(entry.sets).find(s => !s.deleted && s.session_exercise_id === ex.id && s.set_index === i);

  const writeSet = (ex, i, patch) => {
    if (readOnly) return;
    const current = findSet(ex, i);
    outbox.putSet(workoutId, { id: current?.id || newId(), session_exercise_id: ex.id, exercise_name: ex.name, set_index: i, note: "", ...current, ...patch });
    setEntry(outbox.get(workoutId));
    data.setPending(outbox.pendingCount());
    scheduleSync();
  };

  const complete = (ex, i, blockItems) => {
    const current = findSet(ex, i);
    const prev = previousSets({ exercise: ex, workouts: data.workouts, sets: data.sets, excludeWorkoutId: workoutId });
    const fallback = prev?.sets.find(s => s.set_index === i) || prev?.sets[prev.sets.length - 1];
    const patch = { done_at: current?.done_at ? null : new Date().toISOString() };
    if (!current?.done_at) {
      if (current?.load == null || current?.load === "") patch.load = fallback?.load ?? (ex.bodyweight ? 0 : null);
      if (current?.reps == null || current?.reps === "") patch.reps = fallback?.reps ?? null;
    }
    writeSet(ex, i, patch);
    // Nei jump set il recupero parte dopo l'ultimo esercizio del blocco.
    const last = blockItems[blockItems.length - 1].id === ex.id;
    if (!current?.done_at && last && ex.rest_seconds) {
      setRest({ endsAt: Date.now() + ex.rest_seconds * 1000, label: ex.name, total: ex.rest_seconds });
    }
  };

  const finish = async status => {
    outbox.putWorkout({ id: workoutId, status, finished_at: new Date().toISOString() });
    setEntry(outbox.get(workoutId));
    setRest(null);
    await data.sync();
    navigate("/allenamento", { replace: true });
  };

  const saveNotes = notes => {
    outbox.putWorkout({ id: workoutId, notes });
    setEntry(outbox.get(workoutId));
    data.setPending(outbox.pendingCount());
    scheduleSync();
  };

  const doneCount = Object.values(entry.sets).filter(s => !s.deleted && s.done_at).length;
  const totalSets = (session?.exercises || []).reduce((n, e) => n + e.sets, 0);

  // Un blocco alla volta (esercizio singolo o jump set), come nel design; l'ultimo passo è la chiusura.
  const blockDone = block => block.items.every(ex => Array.from({ length: ex.sets }, (_, i) => findSet(ex, i)?.done_at).every(Boolean));
  const firstOpen = blocks.findIndex(b => !blockDone(b));
  const current = step ?? (firstOpen === -1 ? blocks.length : firstOpen);
  const block = blocks[current];
  const goTo = i => { setStep(i); setConfirmEnd(false); window.scrollTo({ top: 0 }); };
  // Prossima serie da registrare: nei jump set si alterna, serie 1 di A1, serie 1 di A2, poi serie 2...
  const nextSet = block && (() => {
    const rounds = Math.max(...block.items.map(ex => ex.sets));
    for (let i = 0; i < rounds; i++) for (const ex of block.items) if (i < ex.sets && !findSet(ex, i)?.done_at) return { ex, i };
    return null;
  })();
  const status = data.offline ? "Offline, salvato" : data.pending ? "Salvataggio…" : "Salvato";
  const restLabel = ex => ex.rest_seconds ? (ex.rest_seconds < 60 ? `${ex.rest_seconds} s` : `${Math.floor(ex.rest_seconds / 60)}:${String(ex.rest_seconds % 60).padStart(2, "0")}`) : "—";

  return (
    <section className="gym">
      <div className="gym-top">
        <Link to="/allenamento" className="round-btn" aria-label="Chiudi la seduta, le serie restano salvate"><X size={20} strokeWidth={1.5} aria-hidden="true" /></Link>
        <span className="eyebrow gym-where">{w.session_name} · {Math.min(current + 1, blocks.length)}/{blocks.length || 1}</span>
        <span className={`gym-status${data.offline ? " off" : ""}`} role="status"><span className="dot" aria-hidden="true" />{status}</span>
      </div>
      <div className="progress thin" role="img" aria-label={`${doneCount} serie su ${totalSets}`}><span style={{ "--value": `${totalSets ? Math.round((doneCount / totalSets) * 100) : 0}%` }} /></div>
      {data.offline && <SyncNotice pending={data.pending} offline={data.offline} onSync={() => data.sync()} />}
      {!session && <div className="notice">Questa seduta non è più nella scheda attiva: puoi vedere le serie registrate nello storico.</div>}
      {current === 0 && session?.notes && <div className="notice pre">{session.notes}</div>}

      {block && (
        <div className={`gym-block${block.items.length > 1 ? " jump" : ""}`}>
          {block.items.length > 1 && <span className="eyebrow">Jump set {block.letter} · alterna gli esercizi, recupera alla fine del giro</span>}
          {block.items.map(ex => {
            const prev = previousSets({ exercise: ex, workouts: data.workouts, sets: data.sets, excludeWorkoutId: workoutId });
            const info = catalog[ex.exercise_id];
            const video = ex.video_url || info?.video_url;
            return (
              <div key={ex.id} className="gym-ex">
                <div className="gym-ex-head">
                  {ex.group_label && <span className="num tag">{ex.group_label}</span>}
                  <h1>{ex.name}</h1>
                  {(video || info?.instructions) && (
                    <div className="gym-links">
                      {video && <a href={video} target="_blank" rel="noreferrer"><PlayCircle size={16} strokeWidth={1.5} aria-hidden="true" />Guarda la tecnica</a>}
                      {info?.instructions && (
                        <button type="button" className="btn link" aria-expanded={Boolean(infoOpen[ex.id])} onClick={() => setInfoOpen({ ...infoOpen, [ex.id]: !infoOpen[ex.id] })}>
                          <Info size={16} strokeWidth={1.5} aria-hidden="true" />{infoOpen[ex.id] ? "Nascondi istruzioni" : "Istruzioni"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {infoOpen[ex.id] && <p className="pre muted">{info.instructions}</p>}
                <dl className="gym-spec">
                  <div><dt>Serie</dt><dd className="num">{ex.sets}×{ex.reps || "—"}</dd></div>
                  <div><dt>{ex.load ? "Carico" : "Tempo"}</dt><dd className="num">{ex.load || ex.tempo || "—"}</dd></div>
                  <div><dt>RIR</dt><dd className="num">{ex.rir || "—"}</dd></div>
                  <div><dt>Recupero</dt><dd className="num">{restLabel(ex)}</dd></div>
                </dl>
                {(ex.film || ex.notes) && (
                  <div className="coach-cue">
                    {ex.film ? <Video size={20} strokeWidth={1.5} aria-hidden="true" /> : <Info size={20} strokeWidth={1.5} aria-hidden="true" />}
                    <p className="pre">{ex.film && <strong>Filma: {ex.film}. </strong>}{ex.notes}</p>
                  </div>
                )}

                <div className="set-table" role="group" aria-label={`Serie di ${ex.name}`}>
                  <div className="set-row head" aria-hidden="true"><span>#</span><span>Volta scorsa</span><span>{ex.bodyweight ? "Zavorra" : "kg"}</span><span>Rip.</span><span /></div>
                  {Array.from({ length: ex.sets }, (_, i) => {
                    const s = findSet(ex, i);
                    const target = setTarget(ex, i);
                    const prevSet = prev?.sets.find(p => p.set_index === i);
                    const id = `set-${ex.id}-${i}`;
                    const done = Boolean(s?.done_at);
                    const isNext = nextSet && nextSet.ex.id === ex.id && nextSet.i === i;
                    return (
                      <div key={i} className={`set${done ? " done" : ""}${isNext ? " next" : ""}`}>
                        <div className="set-row">
                          <span className="num set-n">{i + 1}</span>
                          <span className="num set-prev">{prevSet ? `${num(prevSet.load) || "0"} × ${prevSet.reps ?? "—"}` : "—"}</span>
                          <input id={`${id}-load`} className="input gym-input" inputMode="decimal" readOnly={readOnly}
                            aria-label={`${ex.bodyweight ? "Zavorra" : "Carico"} serie ${i + 1} in kg`}
                            placeholder={prevSet ? num(prevSet.load) : ex.bodyweight ? "0" : target.load || "–"}
                            value={s?.loadText ?? num(s?.load)}
                            onChange={e => { const v = parseNumber(e.target.value); writeSet(ex, i, { loadText: e.target.value, load: v === "" || Number.isNaN(v) ? null : v }); }} />
                          <input id={`${id}-reps`} className="input gym-input" inputMode="numeric" readOnly={readOnly}
                            aria-label={`Ripetizioni serie ${i + 1}${target.reps ? `, obiettivo ${target.reps}` : ""}`}
                            placeholder={prevSet?.reps != null ? String(prevSet.reps) : target.reps || "–"}
                            value={s?.reps ?? ""}
                            onChange={e => { const v = e.target.value.replace(/[^\d]/g, ""); writeSet(ex, i, { reps: v === "" ? null : Number(v) }); }} />
                          <button type="button" className="set-done" aria-pressed={done} disabled={readOnly}
                            aria-label={`Serie ${i + 1} ${done ? "fatta, tocca per annullare" : "da fare, segna come fatta"}`}
                            onClick={() => complete(ex, i, block.items)}>
                            <Check size={22} strokeWidth={done ? 2 : 1.5} aria-hidden="true" />
                          </button>
                        </div>
                        {(target.rir || target.note || s?.note || noteOpen[id] || !readOnly) && (
                          <div className="set-sub">
                            <span className="set-sub-line">
                              {(target.rir || target.note) && <span className="muted">{[target.rir && `RIR ${target.rir}`, target.note].filter(Boolean).join(" · ")}</span>}
                              {!readOnly && !noteOpen[id] && !s?.note && (
                                <button type="button" className="set-note-btn" aria-label={`Aggiungi una nota alla serie ${i + 1}`}
                                  onClick={() => setNoteOpen({ ...noteOpen, [id]: true })}><Pencil size={14} strokeWidth={1.5} aria-hidden="true" />Nota</button>
                              )}
                            </span>
                            {(noteOpen[id] || s?.note) && (
                              <input className="input set-note" aria-label={`Nota serie ${i + 1}`} placeholder="Nota sulla serie" readOnly={readOnly}
                                value={s?.note || ""} onChange={e => writeSet(ex, i, { note: e.target.value })} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!block && (
        <div className="stack gym-end">
          <div className="page-head">
            <span className="eyebrow">Fine seduta · {doneCount}/{totalSets} serie</span>
            <h1>{w.session_name}</h1>
          </div>
          <div className="qfield field">
            <label htmlFor="w-notes">Note sulla seduta</label>
            <textarea id="w-notes" className="input" rows={4} readOnly={readOnly}
              placeholder="Come è andata, sensazioni, dolori…" value={w.notes || ""} onChange={e => saveNotes(e.target.value)} />
          </div>
          {!readOnly && !confirmEnd && <button className="btn lg block" type="button" onClick={() => setConfirmEnd(true)}>Termina la seduta</button>}
          {!readOnly && confirmEnd && (
            <div className="gym-confirm" role="alertdialog" aria-label="Termina la seduta">
              <p>{doneCount < totalSets ? `Hai segnato ${doneCount} serie su ${totalSets}. Vuoi chiudere lo stesso?` : "Chiudere la seduta?"}</p>
              <button className="btn lg block" type="button" onClick={() => finish("done")}>Sì, termina</button>
              <button className="btn ghost block" type="button" onClick={() => setConfirmEnd(false)}>Continua ad allenarti</button>
            </div>
          )}
        </div>
      )}

      <nav className="gym-steps" aria-label="Esercizi della seduta">
        <button type="button" className="btn ghost" disabled={current === 0} onClick={() => goTo(current - 1)}>
          <ArrowLeft size={18} strokeWidth={1.5} aria-hidden="true" />Precedente
        </button>
        {block && (
          <button type="button" className="btn ghost" onClick={() => goTo(current + 1)}>
            {current + 1 < blocks.length ? "Prossimo esercizio" : "Fine seduta"}<ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
      </nav>

      <div className="gym-dock">
        <RestTimer rest={rest} onChange={setRest} />
        {block && !readOnly && (nextSet
          ? <button type="button" className="btn lg block" onClick={() => complete(nextSet.ex, nextSet.i, block.items)}>
              Registra serie {nextSet.i + 1}{block.items.length > 1 ? ` · ${nextSet.ex.group_label || nextSet.ex.name}` : ""}
            </button>
          : <button type="button" className="btn lg block" onClick={() => goTo(current + 1)}>
              {current + 1 < blocks.length ? "Prossimo esercizio" : "Vai alla fine della seduta"}<ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>)}
      </div>
    </section>
  );
}
