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
    <fieldset className="plain values-form">
      <legend>Valori per 100 {basis}</legend>
      <div className="lines">
        {NUTRIENTS.map(({ key, label, unit, sub }) => {
          const bad = Number.isNaN(parsed[key]);
          return (
            <div key={key} className={`value-row${sub ? " sub" : ""}`}>
              <label htmlFor={`fv-${key}`}>{label}</label>
              <input id={`fv-${key}`} className="input num" inputMode="decimal" autoComplete="off" aria-invalid={bad || undefined}
                value={values[key] ?? ""} disabled={unreadable.includes(key)}
                onChange={e => set(key, e.target.value)} />
              <span className="muted unit">{unit}</span>
              {showUnreadable && (
                <label className="inline-check hint">
                  <input type="checkbox" className="check" checked={unreadable.includes(key)} onChange={() => toggle(key)} /> illeggibile
                </label>
              )}
            </div>
          );
        })}
      </div>
      {check && !check.ok && (
        <div className="notice warning">
          Con 4/4/9 da proteine, carboidrati e grassi verrebbero circa {formatAmount(check.estimate, 0)} kcal.
          Controlla le cifre: se l'etichetta riporta proprio {formatAmount(clean.kcal, 0)} kcal, va bene così.
        </div>
      )}
      {problems.map(p => <div key={p} className="notice error">{p}</div>)}
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
