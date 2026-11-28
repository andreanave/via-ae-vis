import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, LogOut, Moon, Sun, SunMoon } from "lucide-react";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { useActor } from "../lib/assist.jsx";
import { initials } from "../lib/format.js";
import { applyTheme, loadThemePreference, nextTheme, themeLabel } from "./theme.js";

const ThemeIcon = { dark: Moon, light: Sun, system: SunMoon };

// Cerchio con le iniziali in alto a destra della Home atleta su telefono: notifiche, tema, esci.
// Sostituisce la barra in alto, che su telefono l'atleta non vede.
// unread arriva da AppShell: un secondo abbonamento realtime sullo stesso canale manda in errore la pagina.
export default function ProfileMenu({ unread = 0 }) {
  const { signOut } = useAuth();
  const actor = useActor();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(loadThemePreference());
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const cycleTheme = () => { const next = nextTheme(theme); applyTheme(next); setTheme(next); };
  const Theme = ThemeIcon[theme];

  return (
    <div className="profile-menu only-phone" ref={ref}>
      <button type="button" className="avatar-btn" aria-haspopup="true" aria-expanded={open}
        aria-label={unread ? `Profilo e impostazioni, ${unread} notifiche da leggere` : "Profilo e impostazioni"}
        onClick={() => setOpen(o => !o)}>
        {initials(actor.fullName) || "·"}
        {unread > 0 && <span className="unread-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="profile-pop">
          <Link to="/notifiche" onClick={() => setOpen(false)}>
            <Bell strokeWidth={1.5} aria-hidden="true" />
            <span>Notifiche</span>
            {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <button type="button" onClick={cycleTheme}>
            <Theme strokeWidth={1.5} aria-hidden="true" /><span>{themeLabel[theme]}</span>
          </button>
          <button type="button" onClick={signOut}>
            <LogOut strokeWidth={1.5} aria-hidden="true" /><span>Esci</span>
          </button>
        </div>
      )}
    </div>
  );
}
