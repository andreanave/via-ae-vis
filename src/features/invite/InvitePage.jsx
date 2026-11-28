import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { authErrorMessage } from "../auth/authErrors.js";
import { rpcErrorMessage } from "../../lib/rpcErrors.js";
import { inviteLink } from "../../lib/format.js";
import BrandMark from "../../ui/BrandMark.jsx";

// Link d'invito: l'atleta crea l'account (o entra con quello che ha) e accetta il collegamento.
export default function InvitePage() {
  const { token } = useParams();
  const { session, user, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(undefined);
  const [mode, setMode] = useState("signup"); // "signup" | "login"
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [info, setInfo] = useState("");

  // Ritorno dal link di conferma: se il login automatico non è riuscito (per esempio link aperto
  // in un altro browser), l'e-mail è comunque confermata e basta entrare con la password.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (session === null && (query.has("code") || query.has("error_description"))) {
      setMode("login");
      setInfo("La tua e-mail è confermata. Entra con la password che hai scelto per accettare l'invito.");
    }
  }, [session]);

  useEffect(() => {
    supabase.rpc("invite_preview", { invite_token: token }).then(({ data, error: err }) => {
      const row = !err && data?.[0];
      setInvite(row || null);
      if (row?.full_name) setFullName(row.full_name);
    });
  }, [token]);

  const accept = async () => {
    setBusy(true); setError("");
    const { error: err } = await supabase.rpc("accept_invite", { invite_token: token });
    setBusy(false);
    if (err) { setError(rpcErrorMessage(err)); return; }
    await refreshProfile?.();
    navigate("/", { replace: true });
  };

  const signUp = async event => {
    event.preventDefault();
    if (password.length < 8) { setError("La password deve avere almeno 8 caratteri."); return; }
    setBusy(true); setError("");
    const { data, error: err } = await supabase.auth.signUp({
      email: invite.email,
      password,
      options: { emailRedirectTo: inviteLink(token), data: { full_name: fullName.trim() } },
    });
    setBusy(false);
    if (err) { setError(authErrorMessage(err)); return; }
    // E-mail già registrata: Supabase non lo dice esplicitamente, restituisce un utente senza identità.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setMode("login");
      setInfo("Con questa e-mail hai già un account. Entra con la tua password per accettare l'invito.");
      return;
    }
    if (!data.session) setSent(true); // serve la conferma dell'e-mail
  };

  const logIn = async event => {
    event.preventDefault();
    setBusy(true); setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email: invite.email, password });
    setBusy(false);
    if (err) setError(authErrorMessage(err));
  };

  if (invite === undefined) return <main className="center muted">Caricamento…</main>;

  const who = invite?.inviter_name || "Il tuo coach";
  const roleText = invite?.kind === "professional" ? "come professionista" : "per seguirti";

  return (
    <main className="center">
      <div className="auth-page">
        <div className="auth-logo"><BrandMark variant="logo" /></div>
        {!invite && <><h1>Invito non trovato</h1><p className="muted">Controlla il link o chiedine uno nuovo.</p></>}
        {invite && invite.status !== "valid" && (
          <>
            <h1>{invite.status === "expired" ? "Invito scaduto" : "Invito già usato"}</h1>
            <p className="muted">
              {invite.status === "expired" ? `Chiedi a ${who} di mandarti un nuovo link.` : "Se è il tuo, accedi normalmente."}
            </p>
            <a className="btn block" href={import.meta.env.BASE_URL}>Vai all'accesso</a>
          </>
        )}

        {invite?.status === "valid" && (
          <>
            <h1>{who} ti ha invitato</h1>
            <p className="muted">Ti invita {roleText}. L'invito è per <strong>{invite.email}</strong>.</p>
            {error && <div className="notice error" role="alert">{error}</div>}
            {info && !error && <div className="notice" role="status">{info}</div>}

            {session && (
              <>
                {user.email?.toLowerCase() !== invite.email.toLowerCase() && (
                  <div className="notice">Sei entrato come {user.email}. L'invito è per un'altra e-mail.</div>
                )}
                <button className="btn lg block" type="button" onClick={accept} disabled={busy}>
                  {busy ? "Attendi…" : "Accetta l'invito"}
                </button>
                <button className="btn ghost block" type="button" onClick={signOut}>
                  Esci e usa un altro account
                </button>
              </>
            )}

            {!session && sent && (
              <div className="notice" role="status">
                Ti abbiamo mandato un'e-mail a {invite.email}. Apri il link di conferma: tornerai qui per accettare l'invito.
              </div>
            )}

            {!session && !sent && mode === "signup" && (
              <form onSubmit={signUp} noValidate>
                <div className="field">
                  <label htmlFor="name">Nome e cognome</label>
                  <input id="name" className="input" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="pw">Scegli una password</label>
                  <input id="pw" className="input" type="password" autoComplete="new-password" value={password}
                    onChange={e => setPassword(e.target.value)} aria-describedby="pw-hint" />
                  <span id="pw-hint" className="muted hint">Almeno 8 caratteri.</span>
                </div>
                <button className="btn lg block" type="submit" disabled={busy || !password || !fullName.trim()}>
                  {busy ? "Attendi…" : "Crea l'account"}
                </button>
                <button className="btn ghost block" type="button" 
                  onClick={() => { setMode("login"); setError(""); }}>
                  Ho già un account
                </button>
              </form>
            )}

            {!session && !sent && mode === "login" && (
              <form onSubmit={logIn} noValidate>
                <div className="field">
                  <label htmlFor="pw2">Password di {invite.email}</label>
                  <input id="pw2" className="input" type="password" autoComplete="current-password" value={password}
                    onChange={e => setPassword(e.target.value)} />
                </div>
                <button className="btn lg block" type="submit" disabled={busy || !password}>
                  {busy ? "Attendi…" : "Entra"}
                </button>
                <button className="btn ghost block" type="button" 
                  onClick={() => { setMode("signup"); setError(""); }}>
                  Non ho ancora un account
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
