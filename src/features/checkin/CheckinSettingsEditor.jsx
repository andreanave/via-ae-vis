import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { CHECKIN_FIELDS, DEFAULT_CONFIG, FIELD_BY_KEY, MOMENT_LABELS, WEEKDAYS, normalizeConfig } from "../../lib/checkinFields.js";

// Il coach sceglie cosa chiedere all'atleta al mattino, alla sera e a fine settimana, e gestisce i modelli.
export default function CheckinSettingsEditor({ athleteId, readOnly, onSaved }) {
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [exists, setExists] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  const loadTemplates = () =>
    supabase.from("checkin_templates").select("id, name, config").eq("professional_id", user.id).order("name")
      .then(({ data }) => setTemplates(data || []));

  useEffect(() => {
    supabase.from("checkin_settings").select("config").eq("athlete_id", athleteId).maybeSingle().then(({ data }) => {
      setExists(Boolean(data));
      setConfig(normalizeConfig(data?.config || DEFAULT_CONFIG));
    });
    loadTemplates();
  }, [athleteId]);

  if (!config) return <p className="muted">Caricamento…</p>;

  const change = next => { setConfig(next); setState("dirty"); };
  const toggleDaily = (moment, key) => {
    const list = config[moment];
    change({ ...config, [moment]: list.includes(key) ? list.filter(k => k !== key) : [...list, key] });
  };
  const weeklyItem = key => config.weekly.find(w => w.key === key);
  const toggleWeekly = key => {
    const item = weeklyItem(key);
    change({ ...config, weekly: item ? config.weekly.filter(w => w.key !== key) : [...config.weekly, { key, required: false, locked: false }] });
  };
  const setWeeklyFlag = (key, flag, value) =>
    change({ ...config, weekly: config.weekly.map(w => (w.key === key ? { ...w, [flag]: value } : w)) });

  const save = async () => {
    setState("saving"); setError("");
    const row = { athlete_id: athleteId, config, updated_by: user.id, updated_at: new Date().toISOString() };
    const { error: err } = exists
      ? await supabase.from("checkin_settings").update(row).eq("athlete_id", athleteId)
      : await supabase.from("checkin_settings").insert(row);
    if (err) { setState("dirty"); setError("Non riesco a salvare. Riprova."); return; }
    setExists(true); setState("saved"); onSaved?.(config);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    const { error: err } = await supabase.from("checkin_templates").insert({ professional_id: user.id, name: templateName.trim(), config });
    if (err) { setError("Non riesco a salvare il modello."); return; }
    setTemplateName(""); loadTemplates();
  };

  const applyTemplate = id => {
    const t = templates.find(x => x.id === id);
    if (t) change(normalizeConfig(t.config));
  };

  return (
    <div className="settings">
      {error && <div className="notice error" role="alert">{error}</div>}
      {!exists && <div className="notice">Check-in non ancora attivo per questo atleta. Ti propongo una configurazione di partenza: modificala e salva.</div>}

      {templates.length > 0 && !readOnly && (
        <div className="field">
          <label htmlFor="tpl">Parti da un tuo modello</label>
          <select id="tpl" className="input" defaultValue="" onChange={e => applyTemplate(e.target.value)}>
            <option value="" disabled>Scegli un modello</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {["morning", "evening"].map(moment => (
        <fieldset key={moment} className="checks">
          <legend>{MOMENT_LABELS[moment]} <span className="muted">· tutti facoltativi per l'atleta</span></legend>
          {CHECKIN_FIELDS.filter(f => f.moments.includes(moment)).map(f => (
            <label key={f.key}>
              <input type="checkbox" className="check" disabled={readOnly} checked={config[moment].includes(f.key)} onChange={() => toggleDaily(moment, f.key)} />
              {f.label}
            </label>
          ))}
        </fieldset>
      ))}

      <fieldset className="checks">
        <legend>Settimanale</legend>
        <div className="field">
          <label htmlFor="wd">Giorno del resoconto</label>
          <select id="wd" className="input" disabled={readOnly} value={config.weekday}
            onChange={e => change({ ...config, weekday: Number(e.target.value) })}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </div>
        {CHECKIN_FIELDS.filter(f => f.moments.includes("weekly")).map(f => {
          const item = weeklyItem(f.key);
          return (
            <div key={f.key} className="weekly-row">
              <label className="main">
                <input type="checkbox" className="check" disabled={readOnly} checked={Boolean(item)} onChange={() => toggleWeekly(f.key)} />
                {f.label}
              </label>
              {item && (
                <>
                  <label className="muted">
                    <input type="checkbox" className="check" disabled={readOnly || item.locked} checked={item.required}
                      onChange={e => setWeeklyFlag(f.key, "required", e.target.checked)} />
                    Obbligatorio
                  </label>
                  <label className="muted" title="L'obbligatorietà resta quella del modello">
                    <input type="checkbox" className="check" disabled={readOnly} checked={item.locked}
                      onChange={e => setWeeklyFlag(f.key, "locked", e.target.checked)} />
                    Vincolato
                  </label>
                </>
              )}
            </div>
          );
        })}
        <p className="muted hint">
          L'atleta ha sempre un campo note libero e facoltativo alla fine. Dati scelti al mattino o alla sera vengono proposti come media nel settimanale.
        </p>
      </fieldset>

      {!readOnly && (
        <div className="actions settings-bar">
          <button className="btn" type="button" onClick={save} disabled={state === "saving" || (exists && state !== "dirty")}>
            {state === "saving" ? "Salvataggio…" : exists ? "Salva le modifiche" : "Attiva il check-in"}
          </button>
          {state === "saved" && <span className="muted" role="status">Salvato</span>}
          <span style={{ flex: 1 }} />
          <input className="input" placeholder="Nome del modello (solo per te)" aria-label="Nome del modello"
            value={templateName} onChange={e => setTemplateName(e.target.value)} />
          <button className="btn secondary" type="button" disabled={!templateName.trim()} onClick={saveTemplate}>Salva come modello</button>
        </div>
      )}
      <span className="muted hint">
        Campi scelti: {config.morning.length} al mattino, {config.evening.length} alla sera, {config.weekly.length} nel settimanale
        {config.weekly.some(w => w.required) ? ` (${config.weekly.filter(w => w.required).map(w => FIELD_BY_KEY[w.key].label.toLowerCase()).length} obbligatori)` : ""}.
      </span>
    </div>
  );
}
