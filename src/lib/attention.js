// Perché un atleta richiede attenzione: messaggi da leggere, note da rispondere, check-in inviati o mancanti.
// Riga dell'elenco atleti del coach (Bibbia §4): un contatore e un motivo leggibile.
import { supabase } from "./supabase.js";
import { addDays } from "./checkinMath.js";
import { todayIso } from "./format.js";
import { loadToAnswer } from "../features/coach/ToAnswer.jsx";

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Funzione pura: dai conteggi al motivo e al numero sul badge.
export function attentionFor({ unread = 0, lastMessage = "", toAnswer = 0, firstNote = "", weeklyDaysAgo = null, lastCheckinDaysAgo = null, tasks = 0, hasCheckin = true }) {
  const count = unread + toAnswer;
  let reason = "";
  if (unread) reason = unread === 1 && lastMessage ? `«${lastMessage.length > 60 ? `${lastMessage.slice(0, 57)}…` : lastMessage}»` : plural(unread, "messaggio da leggere", "messaggi da leggere");
  else if (toAnswer) reason = toAnswer === 1 && firstNote ? `Nota: «${firstNote.length > 50 ? `${firstNote.slice(0, 47)}…` : firstNote}»` : plural(toAnswer, "nota da leggere", "note da leggere");
  else if (weeklyDaysAgo !== null && weeklyDaysAgo <= 2) reason = weeklyDaysAgo === 0 ? "Check-in settimanale inviato oggi" : "Check-in settimanale da guardare";
  else if (hasCheckin && lastCheckinDaysAgo === null) reason = "Nessun check-in ancora";
  else if (hasCheckin && lastCheckinDaysAgo >= 3) reason = `Nessun check-in da ${lastCheckinDaysAgo} giorni`;
  else if (tasks) reason = plural(tasks, "promemoria aperto", "promemoria aperti");
  return { count, reason, urgent: count > 0 || (hasCheckin && (lastCheckinDaysAgo === null || lastCheckinDaysAgo >= 3)) };
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);

// Carica i dati per tutti gli atleti del professionista. athletes: [{ id, modules, pending }].
export async function loadAttention(professionalId, athletes) {
  if (!athletes.length) return {};
  const ids = athletes.map(a => a.id);
  const today = todayIso();
  const [links, entries, weeklies] = await Promise.all([
    supabase.from("care_links").select("id, athlete_id").eq("professional_id", professionalId).in("athlete_id", ids).then(r => r.data || []),
    supabase.from("daily_entries").select("athlete_id, day").in("athlete_id", ids).gte("day", addDays(today, -30)).order("day", { ascending: false }).then(r => r.data || []),
    supabase.from("weekly_checkins").select("athlete_id, confirmed_at").in("athlete_id", ids).eq("status", "confirmed").gte("week_end", addDays(today, -10)).then(r => r.data || []),
  ]);
  const linkIds = links.map(l => l.id);
  const messages = linkIds.length
    ? (await supabase.from("messages").select("care_link_id, sender_id, body, created_at").in("care_link_id", linkIds).is("read_at", null).neq("sender_id", professionalId).order("created_at", { ascending: false })).data || []
    : [];
  const notes = await Promise.all(athletes.map(a => loadToAnswer(a.id, professionalId).catch(() => [])));
  const out = {};
  athletes.forEach((a, i) => {
    const mine = messages.filter(m => m.sender_id === a.id);
    const last = entries.find(e => e.athlete_id === a.id);
    const weekly = weeklies.filter(w => w.athlete_id === a.id).map(w => w.confirmed_at.slice(0, 10)).sort().at(-1);
    out[a.id] = attentionFor({
      unread: mine.length, lastMessage: mine[0]?.body || "", toAnswer: notes[i].length, firstNote: notes[i][0]?.body || "",
      weeklyDaysAgo: weekly ? daysBetween(weekly, today) : null, lastCheckinDaysAgo: last ? daysBetween(last.day, today) : null,
      tasks: a.pending || 0, hasCheckin: (a.modules || []).includes("checkin"),
    });
  });
  return out;
}
