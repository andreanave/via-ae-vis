// Calcoli della panoramica del master: numeri principali e attività recente.
// Funzioni pure, così si provano senza database.

const DAY = 24 * 60 * 60 * 1000;

export const daysUntil = (iso, now = Date.now()) => Math.ceil((new Date(iso).getTime() - now) / DAY);

export function summarize({ profiles = [], links = [], invites = [], now = Date.now() }) {
  const active = links.filter(l => l.status === "active");
  const pending = invites.filter(i => !i.accepted_at);
  return {
    athletes: profiles.filter(p => p.role === "athlete").length,
    professionals: profiles.filter(p => p.role === "professional").length,
    activeLinks: active.length,
    pendingInvites: pending.filter(i => daysUntil(i.expires_at, now) > 0).length,
    expiredInvites: pending.filter(i => daysUntil(i.expires_at, now) <= 0).length,
  };
}

// Unisce sedute, check-in settimanali, nuovi account e messaggi in un'unica cronologia, dalla più recente.
export function recentActivity({ workouts = [], weeklies = [], profiles = [], messages = [], names = {}, limit = 8 }) {
  const name = id => names[id] || "Un atleta";
  const items = [
    ...workouts.filter(w => w.status === "done" && w.finished_at).map(w => ({
      at: w.finished_at, kind: "workout", text: `${name(w.athlete_id)} ha completato ${w.session_name || "una seduta"}`,
    })),
    ...weeklies.filter(w => w.status === "confirmed" && w.confirmed_at).map(w => ({
      at: w.confirmed_at, kind: "checkin", text: `${name(w.athlete_id)} ha inviato il check-in settimanale`,
    })),
    ...profiles.filter(p => p.created_at).map(p => ({
      at: p.created_at, kind: "account", text: `${p.full_name || "Nuovo account"} si è registrato`,
    })),
  ];
  if (messages.length) {
    const last = messages.reduce((a, b) => (a.created_at > b.created_at ? a : b));
    items.push({ at: last.created_at, kind: "message", text: `${messages.length} messaggi negli ultimi 7 giorni` });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
