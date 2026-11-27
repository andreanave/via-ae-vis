import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { BRAND } from "./src/config/brand.js";

// Su GitHub Pages l'app vive in /<nome-repository>/.
const base = process.env.PAGES_BASE || "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: BRAND.name,
        short_name: BRAND.shortName,
        description: BRAND.tagline,
        lang: "it",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f8f7f4",
        theme_color: "#f8f7f4",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: { navigateFallback: "index.html", globPatterns: ["**/*.{js,css,html,svg,woff2}"] },
    }),
  ],
});
