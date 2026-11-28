import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { useActor } from "../../lib/assist.jsx";
import { pickNow } from "../../lib/dayPlan.js";
import { todayIso } from "../../lib/format.js";
import { deleteMealLog, saveMealLog } from "../nutrition/mealLogApi.js";
import { useAthleteDay } from "./useAthleteDay.js";

const greeting = (date = new Date()) => {
  const h = date.getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
};

const BUTTON = { meal: name => `Apri ${name.toLowerCase()}`, training: () => "Vai all'allenamento", checkin: () => "Compila" };

function Macros({ values }) {
  if (!values) return null;
  return (
    <div className="day-macros" style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
      {[["carbs", "carbo g"], ["protein", "prot g"], ["fat", "grassi g"], ["kcal", "kcal"]].map(([k, l]) => (
        <div key={k}><span className="num">{Math.round(values[k])}</span><small>{l}</small></div>
      ))}
    </div>
  );
}

function NowCard({ item }) {
  if (!item) {
    return (
      <div className="now">
        <span className="eyebrow">Adesso</span>
        <p className="muted" style={{ margin: 0 }}>Hai fatto tutto quello che c'era in programma oggi.</p>
      </div>
    );
  }
  return (
    <section className="now" aria-label="Adesso">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="eyebrow">Adesso</span><span className="eyebrow">{item.time}</span>
      </div>
      <div>
        <h2>{item.title}</h2>
        {item.detail && <p className="muted" style={{ margin: "0.4rem 0 0", lineHeight: 1.5 }}>{item.detail}</p>}
      </div>
      {item.kind === "meal" && <Macros values={item.macros} />}
      <Link to={item.to} className="btn lg" style={{ justifyContent: "space-between" }}>
        {(BUTTON[item.kind] || (() => "Apri"))(item.title)}<ArrowRight strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </section>
  );
}

// Home dell'atleta: il momento della giornata in primo piano, poi la giornata intera con gli orari.
export default function AthleteHome() {
  const actor = useActor();
  const { loading, day, links = [], modules, plan, logs = [], reload } = useAthleteDay(actor.id);
  const [busy, setBusy] = useState(null);
  const firstName = (actor.fullName || "").split(" ")[0];
  const items = day?.items || [];
  const now = pickNow(items);
  const done = items.filter(i => i.done).length;
  const dateLabel = new Date().toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  const dayLabel = day?.dayType ? ` · giorno ${day.dayType.key}` : "";
  const team = links.map(l => l.professional).filter(Boolean);

  const toggleSupplement = async item => {
    if (actor.assisting) return;
    setBusy(item.id);
    try {
      if (item.done) {
        const log = logs.find(l => l.kind === "supplement" && l.item_key === item.supplementKey);
        if (log) await deleteMealLog(log.id);
      } else {
        await saveMealLog({ athleteId: actor.id, day: todayIso(), kind: "supplement", key: item.supplementKey, name: item.title, planId: plan?.id });
      }
      reload();
    } finally { setBusy(null); }
  };

  return (
    <section className="stack" style={{ maxWidth: 560, margin: "0 auto", gap: "1.75rem" }}>
      <div className="page-head">
        <span className="eyebrow">{dateLabel}{dayLabel}</span>
        <h1>{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
      </div>

      {loading ? <p className="muted">Caricamento…</p> : <NowCard item={now} />}

      {!loading && (
        <section aria-label="La giornata">
          <div className="section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
            <h2 className="eyebrow" style={{ margin: 0 }}>La giornata</h2>
            {items.length > 0 && <span className="num muted" style={{ fontSize: "0.8rem" }}>{done}/{items.length}</span>}
          </div>
          {items.length === 0 ? (
            <p className="muted">Oggi non c'è niente in programma. Quando il coach caricherà scheda, piano o check-in, li troverai qui con i loro orari.</p>
          ) : (
            <ul className="timeline">
              {items.map(item => {
                const body = (
                  <>
                    <span className="time">{item.time}</span>
                    <span className="what">
                      <span>{item.title}</span>
                      {(item.skipped ? "Saltato" : item.kind === "supplement" ? item.detail : item.kind === "training" ? item.detail : null) &&
                        <small>{item.skipped ? "Saltato" : item.detail}</small>}
                    </span>
                    {item.kind === "supplement"
                      ? <span className="tick" aria-hidden="true">{item.done && <Check size={14} strokeWidth={2} />}</span>
                      : item.done
                        ? <Check size={18} strokeWidth={1.5} color="var(--success)" role="img" aria-label="Fatto" />
                        : <ChevronRight size={18} strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" />}
                  </>
                );
                return (
                  <li key={item.id} className={item.done ? "done" : undefined}>
                    {item.kind === "supplement" ? (
                      <button type="button" className="row" aria-pressed={item.done} disabled={busy === item.id || actor.assisting}
                        onClick={() => toggleSupplement(item)}
                        aria-label={`${item.title}, ${item.done ? "preso: tocca per annullare" : "tocca quando l'hai preso"}`}>
                        {body}
                      </button>
                    ) : (
                      <Link className="row" to={item.to}>{body}</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!plan && modules?.has("nutrition") && <p className="muted" style={{ fontSize: "0.9rem" }}>Il piano alimentare non è ancora stato caricato.</p>}
        </section>
      )}

      <p className="muted" style={{ fontSize: "0.9rem" }}>
        {team.length > 0 && <>Ti seguono: {team.map(p => p.full_name || "un professionista").join(", ")}. </>}
        <Link to="/orari">Cambia gli orari della giornata</Link>
      </p>
    </section>
  );
}
