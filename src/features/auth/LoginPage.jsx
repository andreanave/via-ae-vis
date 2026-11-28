import { useState } from "react";
import { supabase } from "../../lib/supabase.js";
import BrandMark from "../../ui/BrandMark.jsx";
import { BRAND } from "../../config/brand.js";
import { authErrorMessage } from "./authErrors.js";
import { appUrl } from "../../lib/format.js";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // "login" | "reset"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError(""); setInfo("");
    if (mode === "login") {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) setError(authErrorMessage(err));
    } else {
      const redirectTo = appUrl(); // il ritorno dal link apre la scelta della nuova password
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (err) setError(authErrorMessage(err));
      else setInfo("Se l'indirizzo è registrato, riceverai un'e-mail con il link per scegliere una nuova password.");
    }
    setBusy(false);
  };

  return (
    <main className="center">
      <div className="card auth-card">
        <div style={{ display: "flex", justifyContent: "center", margin: "0.5rem 0 2rem" }}><BrandMark variant="logo" /></div>
        <h1>{mode === "login" ? "Accedi" : "Recupera la password"}</h1>
        <p className="muted">{mode === "login" ? BRAND.tagline : "Ti mandiamo un link per sceglierne una nuova."}</p>
        {error && <div className="notice error" role="alert">{error}</div>}
        {info && <div className="notice" role="status">{info}</div>}
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" className="input" type="email" autoComplete="email" inputMode="email"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          {mode === "login" && (
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
          )}
          <button className="btn block" type="submit" disabled={busy || !email || (mode === "login" && !password)}>
            {busy ? "Attendi…" : mode === "login" ? "Entra" : "Invia il link"}
          </button>
        </form>
        <button type="button" className="btn ghost block" style={{ marginTop: "0.75rem" }}
          onClick={() => { setMode(mode === "login" ? "reset" : "login"); setError(""); setInfo(""); }}>
          {mode === "login" ? "Ho dimenticato la password" : "Torna all'accesso"}
        </button>
        <p className="muted" style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
          Per iscriverti serve l'invito del tuo coach.
        </p>
      </div>
    </main>
  );
}
