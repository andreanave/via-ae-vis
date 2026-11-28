import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "./AuthProvider.jsx";
import { authErrorMessage } from "./authErrors.js";

// Usata dopo il link di recupero e dopo l'accettazione di un invito.
export default function NewPasswordPage() {
  const { clearRecovery } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async event => {
    event.preventDefault();
    if (password.length < 8) { setError("La password deve avere almeno 8 caratteri."); return; }
    if (mismatch) return;
    setBusy(true); setError("");
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(authErrorMessage(err)); return; }
    clearRecovery();
    navigate("/", { replace: true });
  };

  return (
    <main className="center">
      <form className="auth-page" onSubmit={submit} noValidate>
        <h1>Scegli la password</h1>
        <p className="muted">Almeno 8 caratteri.</p>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="pw">Nuova password</label>
          <input id="pw" className="input" type="password" autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div className={`field${mismatch ? " invalid" : ""}`}>
          <label htmlFor="pw2">Ripeti la password</label>
          <input id="pw2" className="input" type="password" autoComplete="new-password" aria-invalid={mismatch}
            aria-describedby={mismatch ? "pw2-err" : undefined}
            value={confirm} onChange={e => setConfirm(e.target.value)} />
          {mismatch && <span id="pw2-err" className="error">Le due password non coincidono.</span>}
        </div>
        <button className="btn lg block" type="submit" disabled={busy || !password || !confirm}>
          {busy ? "Salvataggio…" : "Salva e continua"}
        </button>
      </form>
    </main>
  );
}
