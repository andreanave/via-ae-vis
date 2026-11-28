import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import { weekEndFor } from "../../lib/checkinMath.js";
import { todayIso } from "../../lib/format.js";
import { loadEntries, loadSettings, loadWeekly } from "../checkin/checkinApi.js";
import NutritionShortcut from "../nutrition/NutritionShortcut.jsx";

const greeting = (date = new Date()) => {
  const h = date.getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
};

// Suggerisce l'attività coerente con l'ora; tutte le altre restano raggiungibili sotto.
export const pickSuggestion = ({ hour, config, today, weekly, isWeeklyDay }) => {
  if (!config) return null;
  const morningOpen = config.morning.length > 0 && today.morning?.status !== "done";
  const eveningOpen = config.evening.length > 0 && today.evening?.status !== "done";
  const weeklyOpen = config.weekly.length > 0 && weekly?.status !== "confirmed";
  if (hour < 12 && morningOpen) return "morning";
  if (isWeeklyDay && weeklyOpen && hour >= 12) return "weekly";
  if (hour >= 18 && eveningOpen) return "evening";
  if (weekly?.status === "draft") return "weekly";
  return null;
};

const ACTIVITIES = {
  morning: { to: "/checkin/morning", title: "Check-in del mattino", text: "Peso, sonno e come ti senti al risveglio." },
  evening: { to: "/checkin/evening", title: "Check-out della sera", text: "Com'è andata la giornata." },
  weekly: { to: "/settimanale", title: "Check-in settimanale", text: "Controlla i dati della settimana e invia il resoconto." },
};

export default function AthleteHome() {
  const actor = useActor();
  const [team, setTeam] = useState([]);
  const [state, setState] = useState(null);
  const firstName = (actor.fullName || "").split(" ")[0];

  useEffect(() => {
    let active = true;
    supabase.from("care_links").select("professional:profiles!care_links_professional_id_fkey(id, full_name)")
      .eq("athlete_id", actor.id).eq("status", "active")
      .then(({ data }) => active && setTeam((data || []).map(r => r.professional).filter(Boolean)));
    (async () => {
      const config = await loadSettings(actor.id);
      if (!config) { if (active) setState({ config: null }); return; }
      const day = todayIso();
      const end = weekEndFor(day, config.weekday);
      const [rows, weekly] = await Promise.all([loadEntries(actor.id, day, day), loadWeekly(actor.id, end)]);
      const today = Object.fromEntries(rows.map(r => [r.moment, r]));
      if (active) setState({ config, today, weekly, isWeeklyDay: end === day });
    })().catch(() => active && setState({ config: null }));
    return () => { active = false; };
  }, [actor.id]);

  const suggestion = state ? pickSuggestion({ hour: new Date().getHours(), ...state, today: state.today || {} }) : null;
  const available = state?.config
    ? ["morning", "evening", "weekly"].filter(k => (k === "weekly" ? state.config.weekly : state.config[k]).length > 0)
    : [];
  const doneLabel = k => (k === "weekly" ? state.weekly?.status === "confirmed" : state.today?.[k]?.status === "done") ? "Fatto" : null;

  const dateLabel = new Date().toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

  return (
    <section className="stack" style={{ maxWidth: 560, margin: "0 auto", gap: "2rem" }}>
      <div className="page-head">
        <span className="eyebrow">{dateLabel}</span>
        <h1>{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
      </div>
      {state && suggestion && (
        <Link to={ACTIVITIES[suggestion].to} className="now">
          <span className="eyebrow">Adesso</span>
          <div>
            <h2>{ACTIVITIES[suggestion].title}</h2>
            <p className="muted" style={{ margin: "0.4rem 0 0" }}>{ACTIVITIES[suggestion].text}</p>
          </div>
          <span className="btn lg">Inizia<ArrowRight strokeWidth={1.5} aria-hidden="true" /></span>
        </Link>
      )}
      {state && !suggestion && (
        <div className="now">
          <span className="eyebrow">Adesso</span>
          <p className="muted" style={{ margin: 0 }}>Niente in sospeso. Allenamento e pasti arriveranno qui.</p>
        </div>
      )}
      {available.length > 0 && (
        <div>
          <div className="section-head">
            <h2 className="eyebrow">La giornata</h2>
          </div>
          <ul className="lines">
            {available.map(k => (
              <li key={k} style={{ padding: 0 }}>
                <Link to={ACTIVITIES[k].to} style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1, minHeight: 52, color: "inherit", textDecoration: "none" }}>
                  <span style={{ flex: 1, color: doneLabel(k) ? "var(--text-2)" : undefined }}>{ACTIVITIES[k].title}</span>
                  {doneLabel(k)
                    ? <Check strokeWidth={1.5} color="var(--success)" aria-label={doneLabel(k)} role="img" />
                    : <ChevronRight strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" />}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <NutritionShortcut athleteId={actor.id} />
      {team.length > 0 && <p className="muted" style={{ fontSize: "0.9rem" }}>Ti seguono: {team.map(p => p.full_name || "un professionista").join(", ")}.</p>}
    </section>
  );
}
