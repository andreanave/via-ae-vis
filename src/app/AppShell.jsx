import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import BrandMark from "../ui/BrandMark.jsx";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { useActor, useAssist } from "../lib/assist.jsx";
import { applyTheme, loadThemePreference, nextTheme, themeLabel } from "../ui/theme.js";

const linkStyle = ({ isActive }) => ({
  padding: "0.5rem 0.9rem", borderRadius: 10, textDecoration: "none", fontWeight: 600,
  color: isActive ? "var(--text)" : "var(--text-2)", background: isActive ? "var(--surface-2)" : "transparent",
});

export default function AppShell() {
  const { signOut, profile } = useAuth();
  const { viewAs, stop } = useAssist();
  const actor = useActor();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(loadThemePreference());
  const cycleTheme = () => { const next = nextTheme(theme); applyTheme(next); setTheme(next); };
  const isProfessional = actor.role === "professional" || actor.isMaster;
  const exitAssist = () => { stop(); navigate("/gestione"); };

  return (
    <div className="shell">
      {profile?.is_master && viewAs && (
        <div className="assist-banner" role="status">
          <span>Modalità assistenza: stai vedendo l'app come {viewAs.full_name || "utente"} (sola lettura)</span>
          <button className="btn secondary" type="button" onClick={exitAssist}>Esci dall'assistenza</button>
        </div>
      )}
      <header className="topbar">
        <BrandMark />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn ghost" type="button" onClick={cycleTheme} aria-label={themeLabel[theme]} title={themeLabel[theme]}>
            {theme === "dark" ? "Scuro" : theme === "light" ? "Chiaro" : "Auto"}
          </button>
          <button className="btn ghost" type="button" onClick={signOut}>Esci</button>
        </div>
      </header>
      {isProfessional && (
        <nav aria-label="Sezioni" style={{ display: "flex", gap: "0.25rem", padding: "0.5rem 1rem", overflowX: "auto",
          background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          <NavLink to="/" end style={linkStyle}>Atleti</NavLink>
          <NavLink to="/agenda" style={linkStyle}>Agenda</NavLink>
          {profile?.is_master && !viewAs && <NavLink to="/gestione" style={linkStyle}>Gestione</NavLink>}
        </nav>
      )}
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
