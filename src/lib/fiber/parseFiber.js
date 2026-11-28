// Lettura del piano alimentare esportato da Fiber (PDF -> righe di testo -> piano strutturato).
//
// Come è fatto il PDF:
// - pagina 1: intestatario, distribuzione settimanale (A/B per lunedì..domenica) e media settimanale;
// - una sezione per tipo di giorno ("A Giorni di allenamento", "B GIORNI di RIPOSO") con i totali stampati;
// - i pasti con i propri totali; ogni pasto è una sequenza di gruppi: la prima riga del pasto e ogni riga
//   che inizia con "+" aprono un gruppo, le righe "oppure ..." sono alternative dello stesso gruppo;
//   un'opzione può essere composta ("Filetto di tonno 130g + Olive verdi 30g");
// - le altre righe sono note dell'opzione precedente (marca, varietà, frequenza settimanale);
// - "Note": integratori (tutti i giorni / giorni alterni, per momento) e tabelle porzioni ("PORZIONI FRUTTA").
// I gruppi continuano oltre il salto pagina, perché il parser legge le righe di seguito.
//
// Il parser non inventa valori: conserva i totali stampati, calcola la somma dei pasti e segnala le differenze.

import { parseFoodText, parseHousehold, parseQuantity, toNumber } from "./quantity.js";

export const PARSER_VERSION = "fiber-1";

export const WEEKDAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
  "settembre", "ottobre", "novembre", "dicembre"];

const MACROS = ["carbs", "protein", "fat", "kcal"];
const NUM = "(\\d+(?:[.,]\\d+)?)";
const FOUR_NUMBERS = new RegExp(`^${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}$`);
const MEAL_HEADER = new RegExp(`^(?![+]|oppure\\b)(.+?)\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}$`, "i");
const DAY_HEADER = new RegExp(`^([A-Z])\\s+(giorn[io]\\b.*?)(?:\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM})?$`, "i");
const MACRO_LABELS = /^carb\s+prot\s+grassi\s+calorie$/i;
const NOISE = [/^\[pagina \d+\]$/i, /^powered by tcpdf/i];
const FREQUENCY = /^frequenza\s+consumo\s+settimanale\s*:\s*massimo\s+(\d+)\s+volt[ae]\.?$/i;
const OPTION = /^oppure\s+(.+)$/i;
const GROUP = /^\+\s*(.+)$/;
const PORTION_TITLE = /^porzioni\s+(.+)$/i;
const PORTION_ENTRY = new RegExp(`^([^:]+):\\s*${NUM}\\s*(g|ml)\\b\\s*(?:→\\s*(.*))?$`, "i");
const AVERAGE_LINE = new RegExp(`^(carboidrati|proteine|grassi)\\s+${NUM}\\s*g(?:\\s+${NUM}\\s*g/kg)?$`, "i");
const AVERAGE_KCAL = new RegExp(`^${NUM}\\s*kcal$`, "i");

const slug = text => String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const foodKey = name => slug(name);
const macrosFrom = values => Object.fromEntries(MACROS.map((k, i) => [k, toNumber(values[i])]));
const sumMacros = list => Object.fromEntries(MACROS.map(k => [k, list.reduce((s, m) => s + (m?.[k] || 0), 0)]));
const diffMacros = (a, b) => Object.fromEntries(MACROS.map(k => [k, Math.round(((a[k] || 0) - (b[k] || 0)) * 10) / 10]));
const isUpperHeading = line => {
  const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 4 || line.includes(":")) return false;
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, "").length;
  return upper / letters.length >= 0.7;
};

// Unisce le righe di una nota spezzata; un URL spezzato a fine riga si ricompone senza spazio.
const appendText = (previous, next) => {
  if (!previous) return next;
  const lastToken = previous.split(" ").pop();
  return /^https?:\/\//i.test(lastToken) ? `${previous}${next}` : `${previous} ${next}`;
};

// "1-Nave-Alimentazione-da-19-Ottobre-26.pdf" -> versione 1, inizio 2026-10-19.
export const parseFileName = (fileName = "") => {
  const base = String(fileName).replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
  const out = { version: null, startDate: null };
  const version = base.match(/^(\d+)\s/);
  if (version) out.version = Number(version[1]);
  const date = base.match(new RegExp(`\\bda(?:l)?\\s+(\\d{1,2})\\s+(${MONTHS.join("|")})\\s+(\\d{2,4})\\b`, "i"));
  if (date) {
    const year = date[3].length === 2 ? 2000 + Number(date[3]) : Number(date[3]);
    const month = MONTHS.indexOf(date[2].toLowerCase()) + 1;
    out.startDate = `${year}-${String(month).padStart(2, "0")}-${String(date[1]).padStart(2, "0")}`;
  }
  return out;
};

const toLines = input => {
  if (Array.isArray(input)) {
    return input.flatMap(entry => (typeof entry === "string" ? entry.split(/\r?\n/) : entry.lines || []));
  }
  if (input && Array.isArray(input.pages)) return input.pages.flatMap(p => p.lines);
  return String(input || "").split(/\r?\n/);
};

const parseComponents = text => text.split(/\s+\+\s+/).map(part => parseFoodText(part));

export const parseFiberPlan = (input, { fileName = "" } = {}) => {
  const lines = toLines(input).map(l => l.replace(/\s+/g, " ").trim())
    .filter(l => l && !NOISE.some(p => p.test(l)));

  const plan = {
    schema: 1,
    parserVersion: PARSER_VERSION,
    source: "fiber_pdf",
    athleteName: "",
    ...parseFileName(fileName),
    weekPattern: [],
    weeklyAverage: null,
    dayTypes: [],
    supplements: [],
    portionTables: [],
    notes: [],
    frequencyRules: [],
    warnings: [],
  };
  const warn = (code, message, where = null) => plan.warnings.push({ code, message, where });

  let section = "intro";
  let day = null;
  let meal = null;
  let group = null;
  let option = null;
  let pendingDayTotals = false;
  let schedule = null;
  let moment = null;
  let table = null;
  const intro = [];
  const average = {};

  const startGroup = text => {
    group = { key: `${meal.key}.${meal.groups.length + 1}`, options: [] };
    meal.groups.push(group);
    addOption(text);
  };
  const addOption = text => {
    option = {
      key: `${group.key}.${group.options.length + 1}`,
      isDefault: group.options.length === 0,
      components: parseComponents(text),
      notes: [],
      maxPerWeek: null,
    };
    group.options.push(option);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^note$/i.test(line)) { section = "notes"; meal = group = option = null; continue; }

    const dayMatch = line.match(DAY_HEADER);
    if (dayMatch && section !== "notes") {
      section = "days";
      const key = dayMatch[1].toUpperCase();
      const label = dayMatch[2].trim();
      day = {
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
        training: /allenament/i.test(label) ? true : /ripos/i.test(label) ? false : null,
        printed: dayMatch[3] ? macrosFrom(dayMatch.slice(3, 7)) : null,
        meals: [],
      };
      plan.dayTypes.push(day);
      pendingDayTotals = !day.printed;
      meal = group = option = null;
      continue;
    }

    if (section === "intro") { intro.push(line); continue; }
    if (MACRO_LABELS.test(line)) continue;

    if (section === "days") {
      if (pendingDayTotals && FOUR_NUMBERS.test(line)) {
        day.printed = macrosFrom(line.match(FOUR_NUMBERS).slice(1, 5));
        pendingDayTotals = false;
        continue;
      }
      const mealMatch = line.match(MEAL_HEADER);
      if (mealMatch) {
        let key = `${day.key}.${slug(mealMatch[1])}`;
        if (day.meals.some(m => m.key === key)) key = `${key}-${day.meals.length + 1}`;
        meal = { key, name: mealMatch[1].trim(), printed: macrosFrom(mealMatch.slice(2, 6)), groups: [] };
        day.meals.push(meal);
        group = option = null;
        continue;
      }
      if (!meal) { warn("riga_ignorata", `Riga fuori da un pasto: "${line}"`, day.key); continue; }

      const optionMatch = line.match(OPTION);
      const groupMatch = line.match(GROUP);
      if (optionMatch) {
        if (!group) startGroup(optionMatch[1]);
        else addOption(optionMatch[1]);
        continue;
      }
      if (groupMatch || !group) { startGroup(groupMatch ? groupMatch[1] : line); continue; }

      const freq = line.match(FREQUENCY);
      if (freq) { option.maxPerWeek = Number(freq[1]); continue; }
      const last = option.notes.length - 1;
      // Una nota che continua sulla riga successiva inizia in minuscolo o segue un URL spezzato.
      if (last >= 0 && (/^[a-zà-ÿ]/.test(line) || /https?:\/\/\S*$/i.test(option.notes[last])) && !/[.!?]$/.test(option.notes[last])) {
        option.notes[last] = appendText(option.notes[last], line);
      } else {
        option.notes.push(line);
      }
      continue;
    }

    if (section === "notes") {
      const portionTitle = line.match(PORTION_TITLE);
      if (portionTitle && isUpperHeading(line)) {
        const title = portionTitle[1].trim().toLowerCase();
        table = { key: slug(title), title: `Porzioni ${title}`, rule: "", mixRule: null, entries: [] };
        plan.portionTables.push(table);
        continue;
      }
      if (table) {
        const entry = line.match(PORTION_ENTRY);
        if (entry) {
          table.entries.push({
            name: entry[1].trim(),
            qty: toNumber(entry[2]),
            unit: entry[3].toLowerCase(),
            household: parseHousehold(entry[4] || ""),
          });
        } else if (!table.entries.length) {
          table.rule = appendText(table.rule, line);
        } else {
          warn("porzione_non_letta", `Riga della tabella porzioni non riconosciuta: "${line}"`, table.key);
        }
        continue;
      }
      if (/^tutti\s+i\s+giorni$/i.test(line)) { schedule = "daily"; moment = null; continue; }
      if (/^giorni\s+altern[ie]$/i.test(line)) { schedule = "alternate"; moment = null; continue; }
      if (isUpperHeading(line)) { moment = line.charAt(0) + line.slice(1).toLowerCase(); continue; }
      const supplement = line.match(/^([^:]{2,40}):\s*(.+)$/);
      if (supplement && schedule) {
        plan.supplements.push(parseSupplement(supplement[1], supplement[2], schedule, moment));
        continue;
      }
      plan.notes.push(line);
    }
  }

  parseIntro(intro, plan, average);
  finalize(plan, warn);
  return plan;
};

// "Creatina X3 – Nutraff - 3 capsule, ciascuna con almeno 150mL di acqua"
const parseSupplement = (name, rest, schedule, moment) => {
  const [productPart, ...doseParts] = rest.split(/\s+-\s+/);
  const [product, brand] = productPart.split(/\s+–\s+/).map(s => s?.trim() || null);
  const doseText = doseParts.join(" - ");
  const [doseHead, ...instructions] = doseText.split(/,\s*/);
  const dose = doseHead ? parseQuantity(doseHead) : null;
  return {
    name: name.trim(),
    product,
    brand: brand || null,
    dose,
    instructions: instructions.join(", ") || null,
    schedule,
    moment,
    raw: `${name}: ${rest}`,
  };
};

const parseIntro = (intro, plan, average) => {
  const titleIndex = intro.findIndex(l => /^piano\s+nutrizionale\s+di$/i.test(l));
  if (titleIndex >= 0 && intro[titleIndex + 1]) plan.athleteName = intro[titleIndex + 1];
  else {
    const inline = intro.map(l => l.match(/^piano\s+nutrizionale\s+di\s+(.+)$/i)).find(Boolean);
    if (inline) plan.athleteName = inline[1];
  }

  // Solo righe fatte di lettere singole ("A A B A B A B"), così la "E" di un titolo non conta.
  const letters = intro.filter(l => /^[A-Z](?:\s+[A-Z])*$/.test(l)).flatMap(l => l.split(" "));
  const days = intro.flatMap(l => l.split(" ")).filter(t => WEEKDAYS.includes(t.toLowerCase()));
  if (letters.length === 7 && days.length === 7) {
    plan.weekPattern = days.map((d, i) => ({ weekday: WEEKDAYS.indexOf(d.toLowerCase()) + 1, dayType: letters[i] }))
      .sort((a, b) => a.weekday - b.weekday).map(d => d.dayType);
  }

  for (const line of intro) {
    const m = line.match(AVERAGE_LINE);
    if (m) {
      const key = { carboidrati: "carbs", proteine: "protein", grassi: "fat" }[m[1].toLowerCase()];
      average[key] = toNumber(m[2]);
      if (m[3]) (average.perKg ||= {})[key] = toNumber(m[3]);
    }
    const k = line.match(AVERAGE_KCAL);
    if (k) average.kcal = toNumber(k[1]);
  }
  if (Object.keys(average).length) plan.weeklyAverage = { printed: average };
};

const finalize = (plan, warn) => {
  const tableKeys = new Set(plan.portionTables.map(t => t.key));
  const rules = new Map();

  for (const day of plan.dayTypes) {
    if (!day.printed) warn("totali_giorno_mancanti", `Totali stampati del giorno ${day.key} non trovati.`, day.key);
    day.mealsSum = sumMacros(day.meals.map(m => m.printed));
    if (day.printed) {
      day.delta = diffMacros(day.printed, day.mealsSum);
      // Fiber arrotonda ogni pasto: la somma dei pasti può scostarsi di qualche unità dal totale stampato.
      const tolerance = Math.max(10, day.printed.kcal * 0.01);
      day.totalsCheck = Math.abs(day.delta.kcal) <= tolerance ? "arrotondamento" : "da_verificare";
      if (day.totalsCheck === "da_verificare") {
        warn("totali_diversi", `Giorno ${day.key}: totale stampato ${day.printed.kcal} kcal, somma dei pasti ${day.mealsSum.kcal} kcal.`, day.key);
      }
    }
    for (const meal of day.meals) {
      if (!meal.groups.length) warn("pasto_vuoto", `Il pasto "${meal.name}" non ha alimenti.`, meal.key);
      for (const group of meal.groups) {
        for (const option of group.options) {
          for (const c of option.components) {
            if (c.unit === "porzione") {
              const ref = slug(c.name.replace(/\s+fresc[ao]$/i, ""));
              c.portionRef = tableKeys.has(ref) ? ref : null;
              if (!c.portionRef) warn("porzione_senza_tabella", `"${c.raw}": nel PDF non c'è una tabella porzioni per questo alimento.`, option.key);
            }
            if (c.needsReview) warn("quantita_non_letta", `Quantità non riconosciuta in "${c.raw}".`, option.key);
          }
          if (option.maxPerWeek) {
            const name = option.components[0].name;
            const key = foodKey(name);
            const rule = rules.get(key) || { food: name, maxPerWeek: option.maxPerWeek, appliesTo: [] };
            if (rule.maxPerWeek !== option.maxPerWeek) {
              warn("frequenza_diversa", `"${name}" ha limiti settimanali diversi nei pasti: tengo il più basso.`, option.key);
              rule.maxPerWeek = Math.min(rule.maxPerWeek, option.maxPerWeek);
            }
            rule.appliesTo.push(option.key);
            rules.set(key, rule);
          }
        }
      }
    }
  }
  plan.frequencyRules = [...rules.values()];

  for (const table of plan.portionTables) {
    if (/suddivid|met[àa]\s+dose|un\s+terzo/i.test(table.rule)) table.mixRule = "dividi_per_numero_di_frutti";
  }

  if (plan.weekPattern.length !== 7) warn("settimana_mancante", "Distribuzione settimanale dei giorni non trovata.");
  else {
    const missing = [...new Set(plan.weekPattern)].filter(k => !plan.dayTypes.some(d => d.key === k));
    if (missing.length) warn("giorno_mancante", `La settimana usa giorni senza sezione: ${missing.join(", ")}.`);
  }

  // La media stampata in prima pagina è la media pesata dei giorni della settimana.
  if (plan.weeklyAverage && plan.weekPattern.length === 7 && plan.dayTypes.every(d => d.printed)) {
    const byKey = Object.fromEntries(plan.dayTypes.map(d => [d.key, d.printed]));
    const computed = Object.fromEntries(MACROS.map(k => [k,
      Math.round((plan.weekPattern.reduce((s, d) => s + (byKey[d]?.[k] || 0), 0) / 7) * 10) / 10]));
    plan.weeklyAverage.computed = computed;
    plan.weeklyAverage.meaning = "media pesata dei giorni della settimana";
    const printedKcal = plan.weeklyAverage.printed.kcal;
    if (printedKcal && Math.abs(printedKcal - computed.kcal) > 2) {
      warn("media_diversa", `Media settimanale stampata ${printedKcal} kcal, calcolata ${computed.kcal} kcal.`);
    }
  }
  if (!plan.dayTypes.length) warn("nessun_giorno", "Nel testo non c'è nessuna sezione giorno: è un PDF di Fiber?");
};

// Elenco piatto delle opzioni di un pasto, comodo per la UI e per i test.
export const describeGroup = group => group.options.map(o => o.components
  .map(c => `${c.name} ${c.qty ?? ""}${c.unit === "g" || c.unit === "ml" ? c.unit : c.unit ? ` ${c.unit}` : ""}`.trim())
  .join(" + "));
