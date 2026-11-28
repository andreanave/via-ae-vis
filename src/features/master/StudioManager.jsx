import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useBrand } from "../../lib/brand.jsx";
import BrandMark from "../../ui/BrandMark.jsx";

const LOGOS = [
  ["logo_light_url", "Logo per tema chiaro"],
  ["logo_dark_url", "Logo per tema scuro"],
  ["icon_url", "Icona quadrata"],
];

// Studi e marchi: il master crea lo studio, sceglie il titolare e carica logo e colore.
export default function StudioManager({ professionals }) {
  const { user } = useAuth();
  const { refresh } = useBrand();
  const [studios, setStudios] = useState(null);
  const [members, setMembers] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, m] = await Promise.all([
      supabase.from("studios").select("*").order("name"),
      supabase.from("studio_members").select("studio_id, profile_id, role"),
    ]);
    setStudios(s.data || []); setMembers(m.data || []);
  };
  useEffect(() => { load(); }, []);

  const open = studio => {
    setOpenId(studio?.id || "new"); setMessage("");
    setForm(studio
      ? { ...studio, owner: members.find(m => m.studio_id === studio.id && m.role === "owner")?.profile_id || "" }
      : { name: "", brand_name: "", tagline: "", accent: "", owner: "" });
  };

  const save = async event => {
    event.preventDefault();
    if (!form.name.trim()) { setMessage("Scrivi il nome dello studio."); return; }
    if (form.accent && !/^#[0-9a-fA-F]{6}$/.test(form.accent)) { setMessage("Il colore va scritto come #1C3D32."); return; }
    setBusy(true); setMessage("");
    const row = { name: form.name.trim(), brand_name: form.brand_name?.trim() || null, tagline: form.tagline?.trim() || null,
      accent: form.accent || null, updated_at: new Date().toISOString() };
    let id = form.id;
    const res = id
      ? await supabase.from("studios").update(row).eq("id", id)
      : await supabase.from("studios").insert({ ...row, created_by: user.id }).select("id").single();
    if (res.error) { setBusy(false); setMessage("Non riesco a salvare lo studio."); return; }
    id = id || res.data.id;
    const currentOwner = members.find(m => m.studio_id === id && m.role === "owner")?.profile_id;
    if (form.owner !== (currentOwner || "")) {
      if (currentOwner) await supabase.from("studio_members").delete().eq("studio_id", id).eq("profile_id", currentOwner);
      if (form.owner) await supabase.from("studio_members").upsert({ studio_id: id, profile_id: form.owner, role: "owner" });
    }
    setBusy(false);
    await load(); refresh();
    setForm(f => ({ ...f, id })); setOpenId(id);
    setMessage("Studio salvato.");
  };

  const upload = async (field, file) => {
    if (!file || !form.id) return;
    if (file.size > 2 * 1024 * 1024) { setMessage("Il file supera 2 MB."); return; }
    setBusy(true); setMessage("");
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${form.id}/${field.replace("_url", "")}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("brand-assets").upload(path, file, { contentType: file.type, upsert: true });
    if (up.error) { setBusy(false); setMessage("Caricamento non riuscito."); return; }
    const url = supabase.storage.from("brand-assets").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from("studios").update({ [field]: url, updated_at: new Date().toISOString() }).eq("id", form.id);
    setBusy(false);
    if (error) { setMessage("Caricamento non riuscito."); return; }
    setForm(f => ({ ...f, [field]: url }));
    await load(); refresh();
  };

  const nameOf = id => professionals.find(p => p.id === id)?.full_name || "—";

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <h2 style={{ margin: 0 }}>Studi e marchi</h2>
        {openId !== "new" && <button className="btn secondary" type="button" onClick={() => open(null)}>Nuovo studio</button>}
      </div>
      <p className="muted" style={{ margin: 0 }}>Il titolare dello studio e i suoi atleti vedono nome, logo e colore dello studio. Chi non ha uno studio vede il marchio della piattaforma.</p>
      {studios === null && <p className="muted">Caricamento…</p>}
      {studios?.length > 0 && (
        <ul className="lines">
          {studios.map(s => (
            <li key={s.id} style={{ padding: 0 }}>
              <button type="button" onClick={() => open(s)} aria-expanded={openId === s.id}
                style={{ display: "flex", alignItems: "center", gap: "1rem", width: "100%", minHeight: 56, background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}>
                <span style={{ flex: 1 }}>{s.brand_name || s.name}</span>
                <span className="muted">{nameOf(members.find(m => m.studio_id === s.id && m.role === "owner")?.profile_id)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {form && openId && (
        <form className="card" onSubmit={save} noValidate style={{ display: "grid", gap: "0.75rem" }}>
          {message && <div className="notice" role="status">{message}</div>}
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="st-name">Nome dello studio</label>
            <input id="st-name" className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="st-brand">Nome del marchio (se diverso)</label>
            <input id="st-brand" className="input" placeholder="Vis æ Vis" value={form.brand_name || ""} onChange={e => setForm({ ...form, brand_name: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="st-tag">Frase sotto il marchio (facoltativa)</label>
            <input id="st-tag" className="input" value={form.tagline || ""} onChange={e => setForm({ ...form, tagline: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="st-accent">Colore principale</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input type="color" aria-label="Scegli il colore" value={/^#[0-9a-fA-F]{6}$/.test(form.accent || "") ? form.accent : "#1c3d32"}
                onChange={e => setForm({ ...form, accent: e.target.value })} style={{ width: 56, height: 48, border: 0, background: "none" }} />
              <input id="st-accent" className="input" placeholder="#1C3D32" value={form.accent || ""} onChange={e => setForm({ ...form, accent: e.target.value.trim() })} style={{ flex: 1, minWidth: 0 }} />
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="st-owner">Titolare</label>
            <select id="st-owner" className="input" value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}>
              <option value="">Nessuno</option>
              {professionals.map(p => <option key={p.id} value={p.id}>{p.full_name || "Senza nome"}</option>)}
            </select>
          </div>
          {form.id ? LOGOS.map(([field, label]) => (
            <div key={field} className="field" style={{ margin: 0 }}>
              <label htmlFor={`st-${field}`}>{label}</label>
              {form[field] && <img src={form[field]} alt="" style={{ maxHeight: 64, maxWidth: 240, objectFit: "contain", background: field === "logo_dark_url" ? "#141413" : "transparent", padding: 8, borderRadius: 8 }} />}
              <input id={`st-${field}`} type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" disabled={busy}
                onChange={e => upload(field, e.target.files?.[0])} />
            </div>
          )) : <p className="muted" style={{ margin: 0 }}>Salva lo studio per caricare i loghi.</p>}
          {form.id && (
            <div>
              <span className="muted" style={{ fontSize: "0.9rem" }}>Anteprima</span>
              <div style={{ marginTop: 8 }}><BrandMark variant="logo" brand={{ brand_name: form.brand_name || form.name, logo_light_url: form.logo_light_url, logo_dark_url: form.logo_dark_url }} /></div>
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Attendi…" : "Salva"}</button>
            <button className="btn ghost" type="button" onClick={() => { setOpenId(null); setForm(null); }}>Chiudi</button>
          </div>
        </form>
      )}
    </div>
  );
}
