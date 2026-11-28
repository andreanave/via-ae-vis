import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { formatDay } from "../../lib/format.js";
import { newId } from "../../lib/trainingOutbox.js";
import { groupBlocks, previousSets, setTarget } from "../../lib/trainingRotation.js";
import { parseNumber } from "../checkin/FieldInput.jsx";
import { useTrainingData } from "./useTrainingData.js";
import RestTimer, { readRest, writeRest } from "./RestTimer.jsx";
import SyncNotice from "./SyncNotice.jsx";
import { Check, ChevronLeft, Play, Info } from "lucide-react";
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
      setRest({ endsAt: Date.now() + ex.rest_seconds * 1000, label: ex.name });
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

  return (
    <section className="gym">
      <Link to="/allenamento" className="back"><ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />Allenamento</Link>
      <div className="page-head">
        <span className="eyebrow">{formatDay(w.performed_on)}</span>
        <h1>{w.session_name}</h1>
        <div className="gym-progress">
          <span className="num">{doneCount}/{totalSets}</span> serie
          <div className="progress thin" aria-hidden="true"><span style={{ "--value": `${totalSets ? Math.round((doneCount / totalSets) * 100) : 0}%` }} /></div>
        </div>
      </div>
      <SyncNotice pending={data.pending} offline={data.offline} onSync={() => data.sync()} />
      {!session && <div className="notice">Questa seduta non è più nella scheda attiva: puoi vedere le serie registrate nello storico.</div>}
      {session?.notes && <div className="notice pre">{session.notes}</div>}

      {blocks.map((block, bi) => (
        <div key={bi} className={`gym-block${block.items.length > 1 ? " jump" : ""}`}>
          {block.items.length > 1 && <span className="eyebrow">Jump set {block.letter} · alterna gli esercizi, recupera alla fine del giro</span>}
          {block.items.map(ex => {
            const prev = previousSets({ exercise: ex, workouts: data.workouts, sets: data.sets, excludeWorkoutId: workoutId });
            const info = catalog[ex.exercise_id];
            const video = ex.video_url || info?.video_url;
            const prescription = [
              `${ex.sets} × ${ex.reps || "—"}`, ex.load, ex.tempo && `tempo ${ex.tempo}`, ex.rir && `RIR ${ex.rir}`,
              ex.rest_seconds ? `recupero ${Math.floor(ex.rest_seconds / 60)}:${String(ex.rest_seconds % 60).padStart(2, "0")}` : null,
            ].filter(Boolean).join(" · ");
            return (
              <div key={ex.id} className="gym-ex">
                <div className="gym-ex-head">
                  <h2>{ex.group_label && <span className="num tag">{ex.group_label}</span>}{ex.name}</h2>
                  <div className="num prescription">{prescription}</div>
                  {prev && <div className="muted prev">Ultima volta, {formatDay(prev.workout.performed_on)}: <span className="num">{prev.sets.map(s => `${num(s.load)}×${s.reps ?? "—"}`).join("  ")}</span></div>}
                </div>
                {ex.notes && <p className="pre">{ex.notes}</p>}
                {ex.film && <p><strong>Da filmare:</strong> {ex.film}</p>}
                {(info?.instructions || video) && (
                  <div className="actions">
                    {info?.instructions && (
                      <button type="button" className="btn ghost sm" aria-expanded={Boolean(infoOpen[ex.id])} onClick={() => setInfoOpen({ ...infoOpen, [ex.id]: !infoOpen[ex.id] })}>
                        <Info size={16} strokeWidth={1.5} aria-hidden="true" />{infoOpen[ex.id] ? "Nascondi istruzioni" : "Istruzioni"}
                      </button>
                    )}
                    {video && <a className="btn ghost sm" href={video} target="_blank" rel="noreferrer"><Play size={16} strokeWidth={1.5} aria-hidden="true" />Video</a>}
                  </div>
                )}
                {infoOpen[ex.id] && <p className="pre muted">{info.instructions}</p>}

                <div className="sets">
                  {Array.from({ length: ex.sets }, (_, i) => {
                    const s = findSet(ex, i);
                    const target = setTarget(ex, i);
                    const prevSet = prev?.sets.find(p => p.set_index === i);
                    const id = `set-${ex.id}-${i}`;
                    const done = Boolean(s?.done_at);
                    return (
                      <div key={i} className={`set${done ? " done" : ""}`}>
                        <div className="set-row">
                          <span className="num set-n" aria-hidden="true">{i + 1}</span>
                          <div className="set-field">
                            <label htmlFor={`${id}-load`}>{ex.bodyweight ? "Zavorra kg" : "kg"}</label>
                            <input id={`${id}-load`} className="input gym-input" inputMode="decimal" readOnly={readOnly}
                              placeholder={prevSet ? num(prevSet.load) : ex.bodyweight ? "0" : target.load}
                              value={s?.loadText ?? num(s?.load)}
                              onChange={e => { const v = parseNumber(e.target.value); writeSet(ex, i, { loadText: e.target.value, load: v === "" || Number.isNaN(v) ? null : v }); }} />
                          </div>
                          <div className="set-field">
                            <label htmlFor={`${id}-reps`}>Rip.{target.reps ? ` (${target.reps})` : ""}</label>
                            <input id={`${id}-reps`} className="input gym-input" inputMode="numeric" readOnly={readOnly}
                              placeholder={prevSet?.reps != null ? String(prevSet.reps) : ""}
                              value={s?.reps ?? ""}
                              onChange={e => { const v = e.target.value.replace(/[^\d]/g, ""); writeSet(ex, i, { reps: v === "" ? null : Number(v) }); }} />
                          </div>
                          <button type="button" className="set-done" aria-pressed={done} disabled={readOnly}
                            aria-label={`Serie ${i + 1} ${done ? "fatta, tocca per annullare" : "da fare, segna come fatta"}`}
                            onClick={() => complete(ex, i, block.items)}>
                            <Check size={22} strokeWidth={done ? 2 : 1.5} aria-hidden="true" />
                          </button>
                        </div>
                        {(target.rir || target.note) && <span className="muted set-sub">{[target.rir && `RIR ${target.rir}`, target.note].filter(Boolean).join(" · ")}</span>}
                        {noteOpen[id] || s?.note ? (
                          <input className="input set-sub set-note" aria-label={`Nota serie ${i + 1}`} placeholder="Nota sulla serie" readOnly={readOnly}
                            value={s?.note || ""} onChange={e => writeSet(ex, i, { note: e.target.value })} />
                        ) : !readOnly && (
                          <button type="button" className="btn link set-sub"
                            onClick={() => setNoteOpen({ ...noteOpen, [id]: true })}>Aggiungi nota</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="qfield field">
        <label htmlFor="w-notes">Note sulla seduta</label>
        <textarea id="w-notes" className="input" rows={3} readOnly={readOnly}
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

      <RestTimer rest={rest} onChange={setRest} />
    </section>
  );
}
