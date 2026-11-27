export const initials = name =>
  (name || "?").trim().split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase() || "?";

const dayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });
export const formatDay = iso => (iso ? dayFmt.format(new Date(`${iso}T12:00:00`)) : "");

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const MODULE_LABELS = { training: "Allenamento", nutrition: "Alimentazione", checkin: "Check-in" };

export const inviteLink = token =>
  `${window.location.origin}${import.meta.env.BASE_URL}#/invito/${token}`;
