import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { loadCatalog } from "./trainingApi.js";

const blank = { name: "", instructions: "", video_url: "", bodyweight: false };

// Catalogo esercizi del professionista: si riusa in tutte le schede.
export default function ExerciseCatalog() {
  const actor = useActor();
  const [list, setList] = useState(undefined);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | id
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const readOnly = actor.assisting;

  const reload = () => loadCatalog(actor.id).then(setList).catch(() => setList([]));
  useEffect(() => { reload(); }, [actor.id]);

  const open = ex => { setEditing(ex ? ex.id : "new"); setForm(ex ? { ...blank, ...ex, video_url: ex.video_url || "" } : blank); setError(""); };
  const urlOk = !form.video_url.trim() || /^https?:\/\//.test(form.video_url.trim());

  const save = async event => {
    event.preventDefault();
    if (!form.name.trim()) { setError("Scrivi il nome dell'esercizio."); return; }
    if (!urlOk) { setError("Il link al video deve iniziare con https://"); return; }
    const row = { owner_id: actor.id, name: form.name.trim(), instructions: form.instructions, video_url: form.video_url.trim() || null, bodyweight: form.bodyweight };
    const { error: err } = editing === "new"
      ? await supabase.from("exercises").insert(row)
      : await supabase.from("exercises").update(row).eq("id", editing);
    if (err) { setError("Non riesco a salvare. Riprova."); return; }
    setEditing(null); reload();
  };

  const remove = async id => {
    const { error: err } = await supabase.from("exercises").delete().eq("id", id);
    if (!err) { setEditing(null); reload(); }
  };

  const shown = (list || []).filter(e => e.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section style={{ display: "grid", gap: "1rem", maxWidth: 720 }}>
      <Link to="/" className="muted" style={{ textDecoration: "none" }}>← Atleti</Link>
      <h1 style={{ margin: 0 }}>Catalogo esercizi</h1>
      <p className="muted" style={{ margin: 0 }}>Gli esercizi che crei qui si scelgono velocemente quando scrivi una scheda. Gli atleti che segui vedono istruzioni e video.</p>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input className="input" style={{ minWidth: 0, flex: 1 }} placeholder="Cerca" aria-label="Cerca un esercizio" value={query} onChange={e => setQuery(e.target.value)} />
        {!readOnly && <button className="btn" type="button" onClick={() => open(null)}>Nuovo esercizio</button>}
      </div>

      {editing && (
        <form className="card" onSubmit={save} noValidate style={{ display: "grid", gap: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>{editing === "new" ? "Nuovo esercizio" : "Modifica esercizio"}</h2>
          {error && <div className="notice error" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="ex-name">Nome</label>
            <input id="ex-name" className="input" style={{ width: "100%", minWidth: 0 }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ex-instr">Istruzioni</label>
            <textarea id="ex-instr" className="input" rows={4} style={{ minWidth: 0, padding: "0.75rem" }} value={form.instructions}
              onChange={e => setForm({ ...form, instructions: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ex-video">Link al video (facoltativo)</label>
            <input id="ex-video" className="input" style={{ width: "100%", minWidth: 0 }} inputMode="url" placeholder="https://" value={form.video_url}
              aria-invalid={!urlOk} onChange={e => setForm({ ...form, video_url: e.target.value })} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={form.bodyweight} onChange={e => setForm({ ...form, bodyweight: e.target.checked })} />
            A corpo libero (il carico registrato è la zavorra aggiuntiva)
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="btn" type="submit">Salva</button>
            <button className="btn ghost" type="button" onClick={() => setEditing(null)}>Annulla</button>
            {editing !== "new" && <button className="btn ghost" type="button" onClick={() => remove(editing)}>Elimina</button>}
          </div>
        </form>
      )}

      {list === undefined && <p className="muted">Caricamento…</p>}
      {list && list.length === 0 && <div className="notice">Il catalogo è vuoto. Puoi anche scrivere gli esercizi direttamente nella scheda.</div>}
      {shown.length > 0 && (
        <ul className="list">
          {shown.map(ex => (
            <li key={ex.id}>
              <button type="button" className="row" style={{ width: "100%", textAlign: "left", background: "none", border: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
                onClick={() => !readOnly && open(ex)} disabled={readOnly}>
                <span style={{ flex: 1 }}>{ex.name}</span>
                {ex.bodyweight && <span className="muted">Corpo libero</span>}
                {ex.video_url && <span className="muted">Video</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
