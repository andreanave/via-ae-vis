import { useState } from "react";
import { formatQty, supplementsFor } from "../../lib/fiber/planDay.js";

const MACRO_LABELS = [["carbs", "Carb"], ["protein", "Prot"], ["fat", "Grassi"]];

export function Macros({ values }) {
  if (!values) return null;
  return (
    <span className="muted num" style={{ fontSize: "0.85rem" }}>
      {values.kcal} kcal · {MACRO_LABELS.map(([k, l]) => `${l} ${values[k]}`).join(" · ")}
    </span>
  );
}

const optionText = option => option.components.map(c => `${c.name} ${formatQty(c)}`.trim()).join(" + ");

function Group({ group, rules }) {
  return (
    <li style={{ padding: "0.6rem 0", borderTop: "1px solid var(--border)" }}>
      {group.options.map((option, i) => {
        const limit = option.maxPerWeek || rules.get(option.key);
        return (
          <div key={option.key} style={{ paddingLeft: i ? "1rem" : 0, marginTop: i ? "0.35rem" : 0 }}>
            {i > 0 && <span className="muted" style={{ fontSize: "0.85rem" }}>oppure </span>}
            <span style={{ fontWeight: i ? 400 : 500 }}>{optionText(option)}</span>
            {limit && <span className="badge" style={{ marginLeft: "0.5rem" }}>max {limit} a settimana</span>}
            {option.notes.map(n => <div key={n} className="muted" style={{ fontSize: "0.85rem" }}>{n}</div>)}
          </div>
        );
      })}
    </li>
  );
}

// Piano di un tipo di giorno: pasti, alimenti con alternative, integratori e tabelle porzioni.
export default function PlanView({ content, initialDay, date = null }) {
  const days = content?.dayTypes || [];
  const [dayKey, setDayKey] = useState(initialDay || days[0]?.key);
  const day = days.find(d => d.key === dayKey) || days[0];
  if (!day) return <p className="muted">Il piano non contiene giorni.</p>;
  const rules = new Map((content.frequencyRules || []).flatMap(r => r.appliesTo.map(k => [k, r.maxPerWeek])));
  const supplements = supplementsFor(content, date || new Date());

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      {days.length > 1 && (
        <div role="tablist" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {days.map(d => (
            <button key={d.key} type="button" role="tab" aria-selected={d.key === day.key}
              className={d.key === day.key ? "btn secondary" : "btn ghost"} onClick={() => setDayKey(d.key)}>
              {d.key} · {d.label}
            </button>
          ))}
        </div>
      )}
      <div>
        <Macros values={day.printed} />
        {day.totalsCheck === "arrotondamento" && day.delta?.kcal !== 0 && (
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            Somma dei pasti {day.mealsSum.kcal} kcal: la differenza viene dagli arrotondamenti di Fiber.
          </div>
        )}
      </div>
      {day.meals.map(meal => (
        <div key={meal.key} className="card">
          <div className="section-head" style={{ alignItems: "baseline" }}>
            <h3 style={{ margin: 0 }}>{meal.name}</h3>
            <Macros values={meal.printed} />
          </div>
          <ul className="list" style={{ gap: 0, marginTop: "0.5rem" }}>
            {meal.groups.map(g => <Group key={g.key} group={g} rules={rules} />)}
          </ul>
        </div>
      ))}
      {supplements.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Integrazione</h3>
          <ul className="list">
            {supplements.map(s => (
              <li key={s.raw} style={{ opacity: date && !s.today ? 0.55 : 1 }}>
                <strong>{s.name}</strong> {s.dose ? `· ${formatQty(s.dose)}` : ""} {s.moment ? `· ${s.moment.toLowerCase()}` : ""}
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  {[s.product, s.brand].filter(Boolean).join(" – ")}
                  {s.instructions ? ` · ${s.instructions}` : ""}
                  {s.schedule === "alternate" ? (date ? (s.today ? " · oggi sì" : " · oggi no") : " · a giorni alterni") : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(content.portionTables || []).map(t => (
        <details key={t.key} className="card">
          <summary style={{ cursor: "pointer", fontWeight: 500, minHeight: 48, display: "flex", alignItems: "center" }}>{t.title}</summary>
          {t.rule && <p className="muted" style={{ fontSize: "0.9rem" }}>{t.rule}</p>}
          <ul className="list">
            {t.entries.map(e => (
              <li key={e.name}>{e.name}: <span className="num">{e.qty} {e.unit}</span>{e.household ? ` · ${e.household.raw}` : ""}</li>
            ))}
          </ul>
        </details>
      ))}
      {(content.notes || []).map(n => <p key={n} className="muted" style={{ fontSize: "0.9rem" }}>{n}</p>)}
    </div>
  );
}
