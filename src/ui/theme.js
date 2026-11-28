import { BRAND } from "../config/brand.js";

const KEY = "app.theme"; // "light" | "dark" | "system"

export const loadThemePreference = () => {
  try { return localStorage.getItem(KEY) || "system"; } catch { return "system"; }
};

// In palestra il tema è scuro caldo, salvo scelta esplicita del tema chiaro.
let gym = false;
const resolve = pref =>
  gym && pref !== "light" ? "dark" : pref === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light") : pref;

// Colore dello studio (uno solo, scelto per il tema chiaro). Nel tema scuro lo schiarisco verso la carta
// perché resti leggibile sul fondo antracite. null = colore della piattaforma.
let studioAccent = null;
const HEX = /^#?([0-9a-f]{6})$/i;
const mix = (hex, toward, amount) => {
  const a = parseInt(hex, 16), b = parseInt(toward, 16);
  const ch = (x, y) => Math.round(x + (y - x) * amount);
  const r = ch(a >> 16, b >> 16), g = ch((a >> 8) & 255, (b >> 8) & 255), bl = ch(a & 255, b & 255);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
};
const luminance = hex => {
  const n = parseInt(hex.slice(1), 16);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const accentFor = theme => {
  const m = studioAccent && HEX.exec(studioAccent);
  if (!m) return BRAND.accent[theme];
  return theme === "dark" ? mix(m[1], "f1efea", 0.6) : `#${m[1].toLowerCase()}`;
};

export const applyTheme = pref => {
  const theme = resolve(pref);
  const root = document.documentElement;
  root.dataset.theme = theme;
  const accent = accentFor(theme);
  root.style.setProperty("--accent", accent);
  // Testo sul colore: scuro se il colore è chiaro, carta se è scuro.
  root.style.setProperty("--on-accent", luminance(accent) > 0.35 ? "#141413" : "#f8f7f4");
  try { localStorage.setItem(KEY, pref); } catch { /* storage non disponibile */ }
  return theme;
};

export const nextTheme = pref => (pref === "system" ? "dark" : pref === "dark" ? "light" : "system");
export const themeLabel = { system: "Tema: automatico", dark: "Tema: scuro", light: "Tema: chiaro" };

export const setStudioAccent = hex => {
  studioAccent = hex || null;
  applyTheme(loadThemePreference());
};

export const setGymMode = on => {
  gym = on;
  applyTheme(loadThemePreference());
};
