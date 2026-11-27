import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/base.css";
import { applyTheme, loadThemePreference } from "./ui/theme.js";
import App from "./app/App.jsx";
import { BRAND } from "./config/brand.js";

document.title = BRAND.name;
applyTheme(loadThemePreference());

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
