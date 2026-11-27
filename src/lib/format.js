export const initials = name =>
  (name || "?").trim().split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase() || "?";

const dayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });
export const formatDay = iso => (iso ? dayFmt.format(new Date(`${iso}T12:00:00`)) : "");

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const MODULE_LABELS = { training: "Allenamento", nutrition: "Alimentazione", checkin: "Check-in" };

// Link senza "#": i client di posta e i redirect di Supabase a volte perdono la parte dopo il cancelletto.
export const appUrl = (params = {}) => {
  const q = new URLSearchParams(params).toString();
  return `${window.location.origin}${import.meta.env.BASE_URL}${q ? `?${q}` : ""}`;
};
export const inviteLink = token => appUrl({ invito: token });
