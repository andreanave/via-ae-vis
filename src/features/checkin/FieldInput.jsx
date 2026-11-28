import { BRISTOL_TYPES } from "../../lib/checkinFields.js";

// Converte "72,4" in 72.4. Restituisce "" per un campo vuoto (diverso da zero).
export const parseNumber = text => {
  const t = String(text ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return "";
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

const scaleBtn = active => ({
  minWidth: 48, minHeight: 48, borderRadius: 10, fontFamily: "var(--font-mono)", fontSize: "1rem", cursor: "pointer",
  fontVariantNumeric: "tabular-nums", transition: "background-color var(--ease), color var(--ease)",
  border: "1px solid transparent",
  background: active ? "var(--text)" : "var(--surface-2)", color: active ? "var(--bg)" : "var(--text)",
});

// Un campo di check-in, con controlli grandi per il telefono.
export default function FieldInput({ field, value, onChange, id, invalid, describedBy, readOnly }) {
  if (field.type === "scale" || field.type === "bristol") {
    const options = [];
    for (let n = field.min; n <= field.max; n += 1) options.push(n);
    return (
      <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))", gap: 6 }}>
          {options.map(n => (
            <button key={n} type="button" role="radio" aria-checked={value === n} disabled={readOnly}
              title={field.type === "bristol" ? BRISTOL_TYPES[n] : undefined}
              style={scaleBtn(value === n)} onClick={() => onChange(value === n ? "" : n)}>
              {n}
            </button>
          ))}
        </div>
        {field.type === "scale" && (
          <div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginTop: 4 }}>
            <span>{field.min} = {field.lowLabel}</span><span>{field.max} = {field.highLabel}</span>
          </div>
        )}
        {field.type === "bristol" && value !== "" && value !== undefined && value !== null && (
          <div className="muted" style={{ fontSize: "0.9rem", marginTop: 4 }}>Tipo {value}: {BRISTOL_TYPES[value]}</div>
        )}
      </div>
    );
  }
  if (field.type === "text") {
    return (
      <textarea id={id} className="input" rows={3} readOnly={readOnly} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        style={{ width: "100%", padding: "0.75rem", resize: "vertical" }}
        value={value ?? ""} onChange={e => onChange(e.target.value)} />
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input id={id} className="input" inputMode="decimal" autoComplete="off" readOnly={readOnly}
        aria-invalid={invalid || undefined} aria-describedby={describedBy}
        style={{ maxWidth: 160, fontSize: "1.15rem" }}
        value={value ?? ""} onChange={e => onChange(e.target.value)} />
      {field.unit && <span className="muted">{field.unit}</span>}
    </div>
  );
}
