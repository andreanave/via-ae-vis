// Quale tipo di giorno (A, B...) vale in una data, secondo la distribuzione settimanale del piano.
export const weekdayIndex = date => (date.getDay() + 6) % 7; // lunedì = 0

export const dayTypeFor = (content, date = new Date()) => {
  const pattern = content?.weekPattern || [];
  const key = pattern.length === 7 ? pattern[weekdayIndex(date)] : null;
  const types = content?.dayTypes || [];
  return types.find(d => d.key === key) || types[0] || null;
};

// Integratori del giorno: quelli a giorni alterni si alternano contando i giorni dall'inizio del piano.
export const supplementsFor = (content, date = new Date()) => {
  const list = content?.supplements || [];
  const start = content?.startDate ? new Date(`${content.startDate}T12:00:00`) : null;
  const noon = new Date(date); noon.setHours(12, 0, 0, 0);
  const days = start ? Math.round((noon - start) / 86400000) : null;
  return list.map(s => ({
    ...s,
    today: s.schedule !== "alternate" || days === null ? true : ((days % 2) + 2) % 2 === 0,
  }));
};

// Testo leggibile di una quantità: "150 g", "1 porzione", "3 grandi", "5 capsule".
const PLURAL = { porzione: "porzioni", capsula: "capsule", compressa: "compresse", fetta: "fette", pezzo: "pezzi",
  misurino: "misurini", cucchiaino: "cucchiaini", cucchiaio: "cucchiai" };
const SIZE_PLURAL = { grande: "grandi", medio: "medi", piccolo: "piccoli" };
export const formatQty = c => {
  if (c.qty === null || c.qty === undefined) return "";
  const n = String(c.qty).replace(".", ",");
  if (c.unit === "g" || c.unit === "ml") return `${n} ${c.unit}`;
  if (c.size) return `${n} ${c.qty === 1 ? c.size : SIZE_PLURAL[c.size] || c.size}`;
  return `${n} ${c.qty === 1 ? c.unit : PLURAL[c.unit] || c.unit}`;
};
