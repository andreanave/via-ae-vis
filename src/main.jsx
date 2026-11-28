import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "./styles/base.css";
import { applyTheme, loadThemePreference } from "./ui/theme.js";
import App from "./app/App.jsx";
import { BRAND } from "./config/brand.js";

document.title = BRAND.name;

// Un link d'invito arriva come ?invito=TOKEN: lo porto alla pagina dell'invito.
// Il resto della query (per esempio ?code= di Supabase) resta dov'è per il login automatico.
const inviteToken = new URLSearchParams(window.location.search).get("invito");
if (inviteToken && !window.location.hash.startsWith("#/invito/")) {
  window.location.hash = `#/invito/${inviteToken}`;
}
applyTheme(loadThemePreference());

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
