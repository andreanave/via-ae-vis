// Quantità e unità come le scrive Fiber: "80g", "1,5g", "1 porzione", "3 grandi", "5 capsule".
// L'unità originale resta sempre in `raw`: la conversione in grammi la fa il catalogo, non il parser.

const UNIT_ALIASES = [
  [/^(?:g|gr|grammi)$/i, { unit: "g" }],
  [/^kg$/i, { unit: "g", factor: 1000 }],
  [/^ml$/i, { unit: "ml" }],
  [/^(?:l|lt|litri?)$/i, { unit: "ml", factor: 1000 }],
  [/^porzion[ei]$/i, { unit: "porzione" }],
  [/^capsul[ae]$/i, { unit: "capsula" }],
  [/^compress[ae]$/i, { unit: "compressa" }],
  [/^(?:misurin[io]|scoop)$/i, { unit: "misurino" }],
  [/^cucchiain[io]$/i, { unit: "cucchiaino" }],
  [/^cucchia(?:i|io)$/i, { unit: "cucchiaio" }],
  [/^fett[ae]$/i, { unit: "fetta" }],
  [/^(?:pz|pezz[io])$/i, { unit: "pezzo" }],
  [/^grand[ei]$/i, { unit: "pezzo", size: "grande" }],
  [/^medi[eo]?$/i, { unit: "pezzo", size: "medio" }],
  [/^piccol[eio]$/i, { unit: "pezzo", size: "piccolo" }],
];

const UNIT_WORDS = "g|gr|grammi|kg|ml|l|lt|litri?|porzion[ei]|capsul[ae]|compress[ae]|misurin[io]|scoop|cucchiain[io]|cucchia(?:i|io)|fett[ae]|pz|pezz[io]|grand[ei]|medi[eo]?|piccol[eio]";
const TRAILING_QTY = new RegExp(`^(.*?)\\s*(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_WORDS})\\.?$`, "i");

export const toNumber = value => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const normalizeUnit = word => {
  for (const [pattern, meta] of UNIT_ALIASES) if (pattern.test(word)) return meta;
  return null;
};

// "Petto di pollo 150g" -> { name: "Petto di pollo", qty: 150, unit: "g" }
export const parseFoodText = text => {
  const raw = String(text || "").trim();
  const match = raw.match(TRAILING_QTY);
  if (!match || !match[1].trim()) return { name: raw, qty: null, unit: null, raw, needsReview: true };
  const meta = normalizeUnit(match[3]);
  const qty = toNumber(match[2]) * (meta?.factor || 1);
  const item = { name: match[1].trim(), qty, unit: meta?.unit || match[3], raw };
  if (meta?.size) item.size = meta.size;
  return item;
};

// Solo quantità, senza nome: "3 capsule" -> { qty: 3, unit: "capsula" }.
export const parseQuantity = text => {
  const match = String(text || "").trim().match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_WORDS})\\.?$`, "i"));
  if (!match) return null;
  const meta = normalizeUnit(match[2]);
  const out = { qty: toNumber(match[1]) * (meta?.factor || 1), unit: meta?.unit || match[2] };
  if (meta?.size) out.size = meta.size;
  return out;
};

const FRACTION_WORDS = [
  [/^(?:mezz[oa]|met[àa])\b/i, 0.5],
  [/^un\s+terzo\b/i, 1 / 3],
  [/^un\s+quarto\b/i, 0.25],
];

// Misure casalinghe della tabella porzioni: "5 albicocche", "2-3 fichi", "mezza melagrana".
export const parseHousehold = text => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const range = raw.match(/^(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (range) return { min: toNumber(range[1]), max: toNumber(range[2]), what: range[3], raw };
  const single = raw.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (single) return { qty: toNumber(single[1]), what: single[2], raw };
  for (const [pattern, qty] of FRACTION_WORDS) {
    if (pattern.test(raw)) return { qty, what: raw.replace(pattern, "").trim(), raw };
  }
  return { qty: null, what: raw, raw };
};
