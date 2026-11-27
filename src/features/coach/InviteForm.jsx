import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { MODULE_LABELS, inviteLink } from "../../lib/format.js";

// Crea un invito e mostra il link da mandare (WhatsApp, Telegram, e-mail).
export default function InviteForm({ kind = "athlete", onDone }) {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [modules, setModules] = useState(["training", "checkin"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  const toggle = m => setModules(cur => (cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m]));
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async event => {
    event.preventDefault();
    if (!validEmail) { setError("Controlla l'indirizzo e-mail."); return; }
    if (kind === "athlete" && modules.length === 0) { setError("Scegli almeno un'area da seguire."); return; }
    setBusy(true); setError("");
    const { data, error: err } = await supabase
      .from("invites")
      .insert({ email: email.trim().toLowerCase(), full_name: fullName.trim(), invited_by: user.id, kind, modules })
      .select("token")
      .single();
    setBusy(false);
    if (err) { setError("Non riesco a creare l'invito. Riprova."); return; }
    setLink(inviteLink(data.token));
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  };
  const share = () => navigator.share?.({ title: "Invito", text: `Ciao ${fullName}, ecco il tuo invito:`, url: link });

  if (link) {
    return (
      <div>
        <h2>Invito pronto</h2>
        <p className="muted">Manda questo link a {fullName || email}. Vale 7 giorni.</p>
        <input className="input" readOnly value={link} onFocus={e => e.target.select()} style={{ width: "100%", marginBottom: "0.75rem" }} />
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={copy}>{copied ? "Copiato" : "Copia il link"}</button>
          {navigator.share && <button className="btn secondary" type="button" onClick={share}>Condividi</button>}
          <button className="btn ghost" type="button" onClick={onDone}>Chiudi</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2>{kind === "professional" ? "Invita un professionista" : "Invita un atleta"}</h2>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="inv-name">Nome e cognome</label>
        <input id="inv-name" className="input" value={fullName} onChange={e => setFullName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="inv-email">E-mail</label>
        <input id="inv-email" className="input" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      {kind === "athlete" && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 1rem" }}>
          <legend style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Cosa segui per questo atleta</legend>
          {Object.entries(MODULE_LABELS).map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: "0.6rem", minHeight: 40 }}>
              <input type="checkbox" checked={modules.includes(key)} onChange={() => toggle(key)} style={{ width: 20, height: 20 }} />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button className="btn" type="submit" disabled={busy || !email}>{busy ? "Attendi…" : "Crea l'invito"}</button>
        <button className="btn ghost" type="button" onClick={onDone}>Annulla</button>
      </div>
    </form>
  );
}
