import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { FIELD_BY_KEY } from "../../lib/checkinFields.js";
import { addDays, aggregateField, formatNumber, groupEntries, resolveWeeklyValue, weekDays, weekEndFor } from "../../lib/checkinMath.js";
import { formatDay, todayIso } from "../../lib/format.js";
import { loadEntries, loadSettings } from "./checkinApi.js";
import WeekComments from "./WeekComments.jsx";

const WEEKS = 6;

// Resoconto per il professionista: settimana corrente (anche se non ancora confermata) e confronto
// con le settimane precedenti sui parametri scelti.
export default function CheckinSummary({ athleteId, refreshKey }) {
  const [config, setConfig] = useState(undefined);
  const [entries, setEntries] = useState([]);
  const [weeklies, setWeeklies] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const cfg = await loadSettings(athleteId);
      if (!active) return;
      if (!cfg) { setConfig(null); return; }
      const currentEnd = weekEndFor(todayIso(), cfg.weekday);
      const firstDay = addDays(currentEnd, -7 * WEEKS + 1);
      const [rows, w] = await Promise.all([
        loadEntries(athleteId, firstDay, currentEnd),
        supabase.from("weekly_checkins").select("*").eq("athlete_id", athleteId).gte("week_end", firstDay).then(r => r.data || []),
      ]);
      if (!active) return;
      setConfig(cfg); setEntries(rows); setWeeklies(w); setSelected(currentEnd);
    })();
    return () => { active = false; };
  }, [athleteId, refreshKey]);

  const byDay = useMemo(() => groupEntries(entries), [entries]);

  if (config === undefined) return <p className="muted">Caricamento…</p>;
  if (config === null) return <p className="muted">Il check-in non è ancora attivo.</p>;

  const currentEnd = weekEndFor(todayIso(), config.weekday);
  const weekEnds = Array.from({ length: WEEKS }, (_, i) => addDays(currentEnd, -7 * i));
  const weeklyOf = end => weeklies.find(w => w.week_end === end);

  // Valore di una settimana: quello confermato (fotografia al momento dell'invio) o quello calcolato ora.
  const valueOf = (end, key) => {
    const w = weeklyOf(end);
    if (w?.status === "confirmed" && w.snapshot?.[key]) return w.snapshot[key];
    const agg = aggregateField(key, weekDays(end), byDay);
    return resolveWeeklyValue(agg, w?.overrides?.[key]);
  };

  const numericKeys = config.weekly.map(w => w.key).filter(k => FIELD_BY_KEY[k].type !== "text");
  const textKeys = config.weekly.map(w => w.key).filter(k => FIELD_BY_KEY[k].type === "text");
  const sel = weeklyOf(selected);
  const status = sel?.status === "confirmed" ? "Confermato dall'atleta" : sel ? "Bozza in corso" : "Non ancora iniziato";

  return (
    <div className="summary">
      <div className="table-scroll">
        <table className="data-table">
          <caption className="muted">Settimana per settimana (tocca una colonna per i dettagli)</caption>
          <thead>
            <tr>
              <th>Parametro</th>
              {weekEnds.map(end => (
                <th key={end} className="n">
                  <button type="button" className="week-tab" aria-pressed={selected === end}
                    onClick={() => setSelected(end)}>
                    {end === currentEnd ? "Questa" : formatDay(end)}
                    {weeklyOf(end)?.status === "confirmed" ? " ✓" : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {numericKeys.map(key => {
              const f = FIELD_BY_KEY[key];
              return (
                <tr key={key}>
                  <th scope="row">{f.label}{f.unit ? ` (${f.unit})` : ""}</th>
                  {weekEnds.map(end => {
                    const r = valueOf(end, key);
                    return (
                      <td key={end} className={`n${selected === end ? " sel" : ""}`}
                        title={r.origin === "override" ? `Corretto dall'atleta (calcolato ${formatNumber(r.computed, f)})` : r.count ? `Da ${r.count} rilevazioni` : ""}>
                        {formatNumber(r.value, f)}
                        {r.origin === "override" && <span aria-label="corretto dall'atleta"> *</span>}
                        {r.origin === "computed" && r.count > 0 && <span className="muted count"> /{r.count}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted hint">/n = numero di rilevazioni usate · * = valore corretto dall'atleta · ✓ = confermato</p>
      </div>

      <div className="week-detail">
        <span className="eyebrow">{status}</span>
        <h3>Settimana dal {formatDay(weekDays(selected)[0])} al {formatDay(selected)}</h3>
        {textKeys.map(key => (
          <p key={key}><strong>{FIELD_BY_KEY[key].label}:</strong> {sel?.answers?.[key] || <span className="muted">—</span>}</p>
        ))}
        {sel?.notes && <p><strong>Note dell'atleta:</strong> {sel.notes}</p>}
      </div>

      {sel?.id ? (
        <WeekComments weeklyId={sel.id} athleteId={athleteId} fieldKeys={config.weekly.map(w => w.key)} />
      ) : (
        <p className="muted">Potrai commentare questa settimana quando l'atleta avrà iniziato il resoconto.</p>
      )}
    </div>
  );
}
