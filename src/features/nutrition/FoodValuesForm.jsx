import { NUTRIENTS, energyCheck, formatAmount, valueProblems } from "../../lib/foodMath.js";
import { parseNumber } from "../checkin/FieldInput.jsx";

// Campi dei valori per 100 g o 100 ml. Con l'etichetta, ogni cifra si può segnare come illeggibile.
export default function FoodValuesForm({ values, onChange, basis = "g", unreadable = [], onUnreadable, showUnreadable }) {
  const set = (key, text) => onChange({ ...values, [key]: text });
  const parsed = Object.fromEntries(NUTRIENTS.map(({ key }) => [key, parseNumber(values[key])]));
  const clean = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, v === "" || Number.isNaN(v) ? null : v]));
  const check = energyCheck(clean);
  const problems = valueProblems(clean);
  const toggle = key => onUnreadable(unreadable.includes(key) ? unreadable.filter(k => k !== key) : [...unreadable, key]);

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Valori per 100 {basis}</legend>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {NUTRIENTS.map(({ key, label, unit, sub }) => {
          const bad = Number.isNaN(parsed[key]);
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: sub ? 16 : 0 }}>
              <label htmlFor={`fv-${key}`} style={{ flex: "1 1 140px", color: sub ? "var(--text-2)" : undefined }}>{label}</label>
              <input id={`fv-${key}`} className="input num" inputMode="decimal" autoComplete="off" aria-invalid={bad || undefined}
                style={{ width: 110 }} value={values[key] ?? ""} disabled={unreadable.includes(key)}
                onChange={e => set(key, e.target.value)} />
              <span className="muted" style={{ width: 36 }}>{unit}</span>
              {showUnreadable && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 48, fontSize: "0.85rem" }}>
                  <input type="checkbox" checked={unreadable.includes(key)} onChange={() => toggle(key)} /> illeggibile
                </label>
              )}
            </div>
          );
        })}
      </div>
      {check && !check.ok && (
        <div className="notice warning" style={{ marginTop: "0.75rem" }}>
          Con 4/4/9 da proteine, carboidrati e grassi verrebbero circa {formatAmount(check.estimate, 0)} kcal.
          Controlla le cifre: se l'etichetta riporta proprio {formatAmount(clean.kcal, 0)} kcal, va bene così.
        </div>
      )}
      {problems.map(p => <div key={p} className="notice error" style={{ marginTop: "0.5rem" }}>{p}</div>)}
    </fieldset>
  );
}

// Converte i testi del modulo in numeri per il database (vuoto = dato mancante, non zero).
export function valuesToNumbers(values) {
  const out = {};
  for (const { key } of NUTRIENTS) {
    const v = parseNumber(values[key]);
    out[key] = v === "" || Number.isNaN(v) ? null : v;
  }
  return out;
}
