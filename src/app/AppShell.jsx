import { useState } from "react";
import { Outlet } from "react-router-dom";
import BrandMark from "../ui/BrandMark.jsx";
import { useAuth } from "../features/auth/AuthProvider.jsx";
import { applyTheme, loadThemePreference, nextTheme, themeLabel } from "../ui/theme.js";

export default function AppShell() {
  const { signOut } = useAuth();
  const [theme, setTheme] = useState(loadThemePreference());
  const cycleTheme = () => { const next = nextTheme(theme); applyTheme(next); setTheme(next); };

  return (
    <div className="shell">
      <header className="topbar">
        <BrandMark />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn ghost" type="button" onClick={cycleTheme} aria-label={themeLabel[theme]} title={themeLabel[theme]}>
            {theme === "dark" ? "Scuro" : theme === "light" ? "Chiaro" : "Auto"}
          </button>
          <button className="btn ghost" type="button" onClick={signOut}>Esci</button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
