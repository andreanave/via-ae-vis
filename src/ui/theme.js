import { BRAND } from "../config/brand.js";

const KEY = "app.theme"; // "light" | "dark" | "system"

export const loadThemePreference = () => {
  try { return localStorage.getItem(KEY) || "system"; } catch { return "system"; }
};

const resolve = pref =>
  pref === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light") : pref;

export const applyTheme = pref => {
  const theme = resolve(pref);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.setProperty("--accent", BRAND.accent[theme]);
  try { localStorage.setItem(KEY, pref); } catch { /* storage non disponibile */ }
  return theme;
};

export const nextTheme = pref => (pref === "system" ? "dark" : pref === "dark" ? "light" : "system");
export const themeLabel = { system: "Tema: automatico", dark: "Tema: scuro", light: "Tema: chiaro" };
