// Catalogo dei campi di check-in. Il coach sceglie quali usare per ogni atleta e momento.
// type: number | scale | text | bristol
// agg (per il settimanale): avg = media dei giorni presenti, sum = somma, none = solo testo per giorno.
// moments: dove il campo può essere chiesto.
export const CHECKIN_FIELDS = [
  { key: "weight", label: "Peso al risveglio", type: "number", unit: "kg", step: 0.1, min: 20, max: 300, agg: "avg", countLabel: "pesate", moments: ["morning", "weekly"] },
  { key: "sleep_hours", label: "Ore di sonno", type: "number", unit: "h", step: 0.25, min: 0, max: 24, agg: "avg", moments: ["morning", "weekly"] },
  { key: "sleep_quality", label: "Qualità del sonno", type: "scale", min: 0, max: 10, lowLabel: "Pessima", highLabel: "Ottima", agg: "avg", moments: ["morning", "weekly"] },
  { key: "energy", label: "Energia", type: "scale", min: 0, max: 10, lowLabel: "Nessuna", highLabel: "Massima", agg: "avg", moments: ["morning", "evening", "weekly"] },
  { key: "steps", label: "Passi", type: "number", unit: "passi", step: 1, min: 0, max: 100000, agg: "avg", moments: ["evening", "weekly"] },
  { key: "stress", label: "Stress", type: "scale", min: 0, max: 10, lowLabel: "Nessuno", highLabel: "Altissimo", agg: "avg", moments: ["evening", "weekly"] },
  { key: "fatigue", label: "Stanchezza", type: "scale", min: 0, max: 10, lowLabel: "Nessuna", highLabel: "Esausto", agg: "avg", moments: ["evening", "weekly"] },
  { key: "hunger", label: "Fame", type: "scale", min: 0, max: 10, lowLabel: "Nessuna", highLabel: "Fortissima", agg: "avg", moments: ["evening", "weekly"] },
  { key: "neat", label: "Attività fisica non sportiva", type: "text", agg: "none", moments: ["evening", "weekly"] },
  { key: "training_enjoyment", label: "Piacere di allenarsi", type: "scale", min: 0, max: 10, lowLabel: "Nessuno", highLabel: "Moltissimo", agg: "avg", moments: ["evening", "weekly"] },
  { key: "workouts_done", label: "Allenamenti svolti", type: "number", unit: "sedute", step: 1, min: 0, max: 21, agg: "sum", moments: ["weekly"] },
  { key: "workouts_comment", label: "Commento alle sedute", type: "text", agg: "none", moments: ["weekly"] },
  { key: "diet_adherence", label: "Aderenza alle indicazioni alimentari", type: "scale", min: 0, max: 10, lowLabel: "Per niente", highLabel: "Completa", agg: "avg", moments: ["evening", "weekly"] },
  { key: "nutrition_notes", label: "Note sulla nutrizione", type: "text", agg: "none", moments: ["evening", "weekly"] },
  { key: "gi_issues", label: "Disturbi gastrointestinali", type: "text", agg: "none", moments: ["evening", "weekly"] },
  { key: "bristol", label: "Evacuazioni (scala di Bristol)", type: "bristol", min: 1, max: 7, agg: "avg", moments: ["evening", "weekly"] },
  { key: "bowel_frequency", label: "Evacuazioni al giorno", type: "number", unit: "volte", step: 1, min: 0, max: 10, agg: "avg", moments: ["evening", "weekly"] },
];

export const FIELD_BY_KEY = Object.fromEntries(CHECKIN_FIELDS.map(f => [f.key, f]));

export const MOMENT_LABELS = { morning: "Mattino", evening: "Sera", weekly: "Settimanale" };

export const BRISTOL_TYPES = {
  1: "Grumi duri separati",
  2: "A salsiccia, grumosa",
  3: "A salsiccia con crepe",
  4: "Liscia e morbida",
  5: "Pezzi morbidi",
  6: "Pezzi molli, frastagliati",
  7: "Liquida",
};

export const WEEKDAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

// Configurazione di partenza, ispirata al modulo Google usato oggi dal coach.
export const DEFAULT_CONFIG = {
  morning: ["weight", "sleep_hours", "sleep_quality"],
  evening: ["steps", "stress", "fatigue", "hunger"],
  weekly: [
    { key: "weight", required: true, locked: false },
    { key: "sleep_hours", required: true, locked: false },
    { key: "sleep_quality", required: true, locked: false },
    { key: "steps", required: true, locked: false },
    { key: "workouts_done", required: true, locked: false },
    { key: "workouts_comment", required: false, locked: false },
    { key: "diet_adherence", required: true, locked: false },
    { key: "nutrition_notes", required: false, locked: false },
    { key: "stress", required: true, locked: false },
    { key: "fatigue", required: true, locked: false },
    { key: "hunger", required: true, locked: false },
  ],
  weekday: 0,
};

// Il settimanale chiede anche i campi giornalieri? No: chiede solo quelli in config.weekly.
// I giornalieri servono a proporre il valore settimanale.
export const normalizeConfig = (config = {}) => ({
  morning: (config.morning || []).filter(k => FIELD_BY_KEY[k]?.moments.includes("morning")),
  evening: (config.evening || []).filter(k => FIELD_BY_KEY[k]?.moments.includes("evening")),
  weekly: (config.weekly || []).filter(w => FIELD_BY_KEY[w.key]),
  weekday: Number.isInteger(config.weekday) ? config.weekday : 0,
});
