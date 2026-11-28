import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import BrandMark from "../ui/BrandMark.jsx";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { useActor, useAssist } from "../lib/assist.jsx";
import { useBrand } from "../lib/brand.jsx";
import { LogOut, Moon, Sun, SunMoon } from "lucide-react";
import { applyTheme, loadThemePreference, nextTheme, setStudioAccent, themeLabel } from "../ui/theme.js";

const ThemeIcon = { dark: Moon, light: Sun, system: SunMoon };

export default function AppShell() {
  const { signOut, profile } = useAuth();
  const { viewAs, stop } = useAssist();
  const actor = useActor();
  const { brand } = useBrand();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(loadThemePreference());
  useEffect(() => { setStudioAccent(brand?.accent); return () => setStudioAccent(null); }, [brand?.accent]);
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
        <BrandMark brand={brand} />
        {isProfessional && (
          <nav aria-label="Sezioni" className="topnav">
            <NavLink to="/" end>Atleti</NavLink>
            <NavLink to="/agenda">Agenda</NavLink>
            <NavLink to="/catalogo">Catalogo</NavLink>
            {profile?.is_master && !viewAs && <NavLink to="/gestione">Gestione</NavLink>}
          </nav>
        )}
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button className="icon-btn" type="button" onClick={cycleTheme} aria-label={themeLabel[theme]} title={themeLabel[theme]}>
            {(() => { const I = ThemeIcon[theme]; return <I strokeWidth={1.5} aria-hidden="true" />; })()}
          </button>
          <button className="icon-btn" type="button" onClick={signOut} aria-label="Esci" title="Esci">
            <LogOut strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
