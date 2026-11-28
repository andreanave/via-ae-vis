import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import BrandMark from "../ui/BrandMark.jsx";
import ProfileMenu from "../ui/ProfileMenu.jsx";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { useActor, useAssist } from "../lib/assist.jsx";
import { useBrand } from "../lib/brand.jsx";
import { Bell, Dumbbell, House, LogOut, MessageCircle, Moon, Sun, SunMoon, UtensilsCrossed } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useUnreadCount } from "../features/messages/useNotifications.js";
import { applyTheme, loadThemePreference, nextTheme, setStudioAccent, themeLabel } from "../ui/theme.js";

const ThemeIcon = { dark: Moon, light: Sun, system: SunMoon };

// Moduli attivi dell'atleta (unione dei collegamenti): decidono quali schede mostrare in basso.
function useAthleteModules(athleteId, enabled) {
  const [modules, setModules] = useState(null);
  useEffect(() => {
    if (!enabled || !athleteId) return;
    let active = true;
    supabase.from("care_links").select("modules").eq("athlete_id", athleteId).eq("status", "active")
      .then(({ data }) => active && setModules(new Set((data || []).flatMap(r => r.modules || []))));
    return () => { active = false; };
  }, [athleteId, enabled]);
  return modules;
}

const TABS = [
  { to: "/", label: "Oggi", icon: House, end: true },
  { to: "/allenamento", label: "Allenamento", icon: Dumbbell, module: "training" },
  { to: "/alimentazione", label: "Alimentazione", icon: UtensilsCrossed, module: "nutrition" },
  { to: "/messaggi", label: "Chat", icon: MessageCircle },
];

export default function AppShell() {
  const { signOut, profile } = useAuth();
  const { viewAs, stop } = useAssist();
  const actor = useActor();
  const { brand } = useBrand();
  const unread = useUnreadCount(actor.id, !actor.assisting);
  const navigate = useNavigate();
  const [theme, setTheme] = useState(loadThemePreference());
  useEffect(() => { setStudioAccent(brand?.accent); return () => setStudioAccent(null); }, [brand?.accent]);
  const cycleTheme = () => { const next = nextTheme(theme); applyTheme(next); setTheme(next); };
  const isProfessional = actor.role === "professional" || actor.isMaster;
  const exitAssist = () => { stop(); navigate("/gestione"); };
  const modules = useAthleteModules(actor.id, !isProfessional);
  const { pathname } = useLocation();
  // In palestra e nei check-in lo schermo resta tutto all'attività: niente barra in basso.
  const focused = ["/allenamento/seduta/", "/checkin/", "/settimanale"].some(p => pathname.startsWith(p));
  const showTabs = !isProfessional && !focused;
  const tabs = TABS.filter(t => !t.module || !modules || modules.has(t.module));

  return (
    <div className="shell">
      {profile?.is_master && viewAs && (
        <div className="assist-banner" role="status">
          <span>Modalità assistenza: stai vedendo l'app come {viewAs.full_name || "utente"} (sola lettura)</span>
          <button className="btn secondary" type="button" onClick={exitAssist}>Esci dall'assistenza</button>
        </div>
      )}
      <header className={isProfessional ? "topbar" : "topbar athlete-topbar"}>
        <BrandMark brand={brand} />
        {isProfessional && (
          <nav aria-label="Sezioni" className="topnav">
            <NavLink to="/" end>Atleti</NavLink>
            <NavLink to="/agenda">Agenda</NavLink>
            <NavLink to="/messaggi">Chat</NavLink>
            <NavLink to="/esercizi">Esercizi</NavLink>
            <NavLink to="/catalogo">Alimenti</NavLink>
            {profile?.is_master && !viewAs && <NavLink to="/gestione">Gestione</NavLink>}
          </nav>
        )}
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <NavLink className="icon-btn" to="/notifiche" aria-label={unread ? `Notifiche, ${unread} da leggere` : "Notifiche"} title="Notifiche">
            <Bell strokeWidth={1.5} aria-hidden="true" />
            {unread > 0 && <span className="badge icon-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
          </NavLink>
          <button className="icon-btn" type="button" onClick={cycleTheme} aria-label={themeLabel[theme]} title={themeLabel[theme]}>
            {(() => { const I = ThemeIcon[theme]; return <I strokeWidth={1.5} aria-hidden="true" />; })()}
          </button>
          <button className="icon-btn" type="button" onClick={signOut} aria-label="Esci" title="Esci">
            <LogOut strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className={`content${showTabs ? " with-tabs" : ""}${isProfessional ? "" : " athlete-content"}`}>
        {/* Su telefono l'atleta non ha la barra in alto: notifiche, tema ed esci stanno nel cerchio della Home. */}
        {!isProfessional && pathname === "/" && <div className="home-profile"><ProfileMenu unread={unread} /></div>}
        <Outlet />
      </main>
      {showTabs && (
        <nav aria-label="Navigazione principale" className="tabbar">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon strokeWidth={1.5} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
