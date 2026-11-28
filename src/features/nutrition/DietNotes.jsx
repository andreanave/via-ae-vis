import { useEffect, useState } from "react";
import { ALLERGENS } from "../../lib/planSuggestions.js";
import { loadDietNotes, saveDietNotes } from "./nutritionApi.js";

const EMPTY = { lactose_intolerant: false, allergens: [], other: "" };

// Intolleranze e allergie dell'atleta: servono ai suggerimenti sul piano. Le compila chi segue l'alimentazione.
export default function DietNotes({ athleteId, actorId, readOnly, onChange }) {
  const [notes, setNotes] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDietNotes(athleteId)
      .then(n => { setNotes(n || EMPTY); onChange?.(n || EMPTY); })
      .catch(() => { setNotes(EMPTY); setError("Non riesco a caricare intolleranze e allergie."); });
  }, [athleteId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!notes) return null;
  const summary = [notes.lactose_intolerant && "Intolleranza al lattosio",
    ...(notes.allergens || []).map(a => `Allergia: ${ALLERGENS[a]?.label.toLowerCase() || a}`)].filter(Boolean);

  const toggle = code => setForm(f => ({ ...f, allergens: f.allergens.includes(code)
    ? f.allergens.filter(a => a !== code) : [...f.allergens, code] }));

  const save = async () => {
    setBusy(true); setError("");
    try {
      const saved = await saveDietNotes({ athleteId, actorId, ...form });
      setNotes(saved); onChange?.(saved); setEditing(false);
    } catch { setError("Salvataggio non riuscito."); } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <div className="diet-notes">
        <div className="eyebrow">Intolleranze e allergie</div>
        <p style={{ margin: "0.25rem 0" }}>{summary.length ? summary.join(" · ") : <span className="muted">Nessuna indicata.</span>}</p>
        {notes.other && <p className="muted hint" style={{ margin: 0 }}>{notes.other}</p>}
        {error && <p className="notice error" role="alert">{error}</p>}
        {!readOnly && (
          <button type="button" className="btn ghost" onClick={() => {
            setForm({ lactose_intolerant: !!notes.lactose_intolerant, allergens: notes.allergens || [], other: notes.other || "" });
            setEditing(true);
          }}>Modifica</button>
        )}
      </div>
    );
  }

  return (
    <fieldset className="diet-notes editing">
      <legend className="eyebrow">Intolleranze e allergie</legend>
      <p className="muted hint">Servono ai suggerimenti sul piano. Le vedono l'atleta e chi lo segue per l'alimentazione.</p>
      <label className="check-row">
        <input type="checkbox" checked={form.lactose_intolerant}
          onChange={e => setForm({ ...form, lactose_intolerant: e.target.checked })} />
        Intolleranza al lattosio
      </label>
      <div className="muted hint" id="dn-all">Allergie (14 allergeni UE)</div>
      <div className="allergen-grid" role="group" aria-labelledby="dn-all">
        {Object.entries(ALLERGENS).map(([code, a]) => (
          <button key={code} type="button" className={`chip${form.allergens.includes(code) ? " on" : ""}`}
            aria-pressed={form.allergens.includes(code)} onClick={() => toggle(code)}>{a.label}</button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="dn-other">Altro (facoltativo)</label>
        <input id="dn-other" className="input" maxLength={500} value={form.other}
          onChange={e => setForm({ ...form, other: e.target.value })} placeholder="Es. non mangia carne di maiale" />
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" className="btn" disabled={busy} onClick={save}>Salva</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => setEditing(false)}>Annulla</button>
      </div>
    </fieldset>
  );
}
