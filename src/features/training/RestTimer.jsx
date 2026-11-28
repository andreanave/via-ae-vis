import { useEffect, useState } from "react";
import { formatClock, restRemaining } from "../../lib/trainingRotation.js";

const KEY = "app.training.rest";
export const readRest = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
export const writeRest = value => { try { value ? localStorage.setItem(KEY, JSON.stringify(value)) : localStorage.removeItem(KEY); } catch { /* */ } };

// Barra del recupero: conta verso un orario di fine salvato, quindi sopravvive a blocco schermo e ricarica.
export default function RestTimer({ rest, onChange }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!rest) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [rest]);

  const left = rest ? restRemaining(rest.endsAt, now) : 0;
  useEffect(() => {
    if (rest && left === 0 && !rest.notified) {
      navigator.vibrate?.([200, 100, 200]);
      onChange({ ...rest, notified: true });
    }
  }, [left, rest, onChange]);

  if (!rest) return null;
  const shift = s => onChange({ ...rest, endsAt: Math.max(Date.now(), rest.endsAt + s * 1000), notified: false });
  return (
    <div role="timer" aria-live={left === 0 ? "assertive" : "off"}
      style={{ position: "sticky", bottom: 0, zIndex: 5, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div className="muted" style={{ fontSize: "0.85rem" }}>{left === 0 ? "Recupero finito" : `Recupero · ${rest.label || ""}`}</div>
        <div style={{ fontSize: "2rem", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{formatClock(left)}</div>
      </div>
      <button type="button" className="btn ghost" onClick={() => shift(-15)} aria-label="Togli 15 secondi">−15</button>
      <button type="button" className="btn ghost" onClick={() => shift(15)} aria-label="Aggiungi 15 secondi">+15</button>
      <button type="button" className="btn" onClick={() => onChange(null)}>{left === 0 ? "Chiudi" : "Salta"}</button>
    </div>
  );
}
