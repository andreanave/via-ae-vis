import { useEffect, useState } from "react";
import { ArrowRight, Dumbbell, ClipboardCheck, MessageCircle, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabase.js";
import { MODULE_LABELS, formatDay, todayIso } from "../../lib/format.js";
import { daysUntil, recentActivity, summarize } from "../../lib/overview.js";

const KIND_ICON = { workout: Dumbbell, checkin: ClipboardCheck, message: MessageCircle, account: UserPlus };
const when = iso => new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Panoramica del master: numeri principali, coppie coach-atleta, inviti in attesa, attività degli ultimi 7 giorni.
// Solo letture: il master vede tutto grazie alle regole RLS (is_master()).
export default function MasterOverview({ profiles, onAssist }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profiles) return;
    let active = true;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase.from("care_links").select("id, athlete_id, professional_id, modules, status, started_at"),
      supabase.from("invites").select("id, email, full_name, kind, invited_by, expires_at, accepted_at, created_at").is("accepted_at", null).order("created_at", { ascending: false }),
      supabase.from("workout_logs").select("athlete_id, session_name, status, finished_at").gte("finished_at", since),
      supabase.from("weekly_checkins").select("athlete_id, status, confirmed_at").gte("confirmed_at", since),
      supabase.from("messages").select("created_at").gte("created_at", since),
    ]).then(results => {
      if (!active) return;
      if (results.some(r => r.error)) setError("Una parte della panoramica non si è caricata.");
      const [links, invites, workouts, weeklies, messages] = results.map(r => r.data || []);
      setData({ links, invites, workouts, weeklies, messages });
    });
    return () => { active = false; };
  }, [profiles]);

  if (!profiles || !data) return <p className="muted">Caricamento della panoramica…</p>;

  const byId = Object.fromEntries(profiles.map(p => [p.id, p]));
  const names = Object.fromEntries(profiles.map(p => [p.id, p.full_name || "Senza nome"]));
  const others = profiles.filter(p => !p.is_master || p.role === "athlete");
  const s = summarize({ profiles: others, links: data.links, invites: data.invites });
  const recentProfiles = profiles.filter(p => p.created_at && p.created_at >= new Date(Date.now() - 7 * 864e5).toISOString());
  const activity = recentActivity({ ...data, profiles: recentProfiles, names });
  const activeLinks = data.links.filter(l => l.status === "active");
  const today = todayIso();

  const kpis = [
    ["Atleti", s.athletes],
    ["Professionisti", s.professionals],
    ["Coppie attive", s.activeLinks],
    ["Inviti in attesa", s.pendingInvites],
  ];

  return (
    <div className="overview">
      {error && <div className="notice warning" role="status">{error}</div>}
      <dl className="kpis">
        {kpis.map(([label, value]) => (
          <div key={label} className="kpi">
            <dt>{label}</dt>
            <dd className="num">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="overview-grid">
        <section className="stack" aria-labelledby="ov-links">
          <div className="section-head"><h2 id="ov-links" className="eyebrow">Coppie coach-atleta</h2></div>
          {activeLinks.length === 0 ? <p className="muted hint">Nessun atleta collegato a un professionista.</p> : (
            <ul className="lines">
              {activeLinks.map(l => (
                <li key={l.id} className="pair">
                  <span className="pair-names">
                    <span>{names[l.professional_id] || "Professionista"}</span>
                    <ArrowRight size={16} strokeWidth={1.5} aria-label="segue" />
                    <span>{names[l.athlete_id] || "Atleta"}</span>
                  </span>
                  <span className="muted hint">{(l.modules || []).map(m => MODULE_LABELS[m]).join(" · ")}{l.started_at ? ` · dal ${formatDay(l.started_at.slice(0, 10))}` : ""}</span>
                  {onAssist && byId[l.athlete_id] && <button type="button" className="btn link" onClick={() => onAssist(byId[l.athlete_id])}>Vedi come atleta</button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="stack" aria-labelledby="ov-invites">
          <div className="section-head"><h2 id="ov-invites" className="eyebrow">Inviti in attesa</h2></div>
          {data.invites.length === 0 ? <p className="muted hint">Nessun invito in attesa.</p> : (
            <ul className="lines">
              {data.invites.map(i => {
                const left = daysUntil(i.expires_at);
                return (
                  <li key={i.id} className="invite-row">
                    <span className="convo-text">
                      <span>{i.full_name || i.email}</span>
                      <span className="muted hint">{i.kind === "professional" ? "Professionista" : "Atleta"} · da {names[i.invited_by] || "—"}</span>
                    </span>
                    <span className={`num due${left <= 0 ? " late" : ""}`}>{left <= 0 ? "Scaduto" : left === 1 ? "Scade domani" : `${left} giorni`}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="stack" aria-labelledby="ov-activity">
        <div className="section-head">
          <h2 id="ov-activity" className="eyebrow">Ultimi 7 giorni</h2>
          <span className="muted num hint">{data.workouts.filter(w => w.status === "done").length} sedute · {data.weeklies.filter(w => w.status === "confirmed").length} check-in · {data.messages.length} messaggi</span>
        </div>
        {activity.length === 0 ? <p className="muted hint">Ancora nessuna attività questa settimana.</p> : (
          <ul className="lines">
            {activity.map((a, i) => {
              const Icon = KIND_ICON[a.kind];
              return (
                <li key={i} className="activity">
                  <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                  <span className="day-name">{a.text}</span>
                  <span className="muted num convo-time">{a.at.slice(0, 10) === today ? when(a.at).split(", ").pop() : when(a.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
