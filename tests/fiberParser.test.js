// Lettura del PDF Fiber su un piano finto con la stessa struttura del PDF reale.
// Il PDF vero di un atleta non entra mai nella repository (CLAUDE.md, regola 4).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeGroup, parseFiberPlan, parseFileName } from "../src/lib/fiber/parseFiber.js";
import { itemsToLines } from "../src/lib/fiber/pdfLines.js";
import { parseFoodText, parseHousehold } from "../src/lib/fiber/quantity.js";

const text = readFileSync("tests/fixtures/fiber-finto.txt", "utf8");
const plan = parseFiberPlan(text, { fileName: "3-Prova-Alimentazione-da-2-Marzo-27.pdf" });
const day = key => plan.dayTypes.find(d => d.key === key);
const meal = (dayKey, name) => day(dayKey).meals.find(m => m.name === name);

describe("intestazione e settimana", () => {
  it("legge intestatario, versione e data di inizio dal nome del file", () => {
    expect(plan.athleteName).toBe("Atleta di Prova");
    expect(plan.version).toBe(3);
    expect(plan.startDate).toBe("2027-03-02");
    expect(parseFileName("1-Nome-Alimentazione-da-19-Ottobre-26.pdf")).toEqual({ version: 1, startDate: "2026-10-19" });
  });

  it("ricava la distribuzione settimanale da lunedì a domenica", () => {
    expect(plan.weekPattern).toEqual(["A", "B", "A", "B", "A", "A", "B"]);
  });

  it("la media stampata è la media pesata dei giorni della settimana", () => {
    expect(plan.weeklyAverage.printed).toMatchObject({ carbs: 213, protein: 110, fat: 54, kcal: 1777 });
    expect(plan.weeklyAverage.printed.perKg).toEqual({ carbs: 3, protein: 1.6, fat: 0.8 });
    expect(Math.round(plan.weeklyAverage.computed.kcal)).toBe(1777);
    expect(plan.warnings.map(w => w.code)).not.toContain("media_diversa");
  });
});

describe("tipi di giorno e totali", () => {
  it("riconosce giorno di allenamento e di riposo", () => {
    expect(plan.dayTypes.map(d => [d.key, d.training])).toEqual([["A", true], ["B", false]]);
    expect(day("B").label).toBe("Giorni di riposo");
  });

  it("conserva il totale stampato e la somma dei pasti, con la differenza di arrotondamento", () => {
    expect(day("A").printed.kcal).toBe(2001);
    expect(day("A").mealsSum.kcal).toBe(2004);
    expect(day("A").delta.kcal).toBe(-3);
    expect(day("A").totalsCheck).toBe("arrotondamento");
    expect(day("B").delta).toEqual({ carbs: 0, protein: 1, fat: 0, kcal: 3 });
  });

  it("segnala una differenza troppo grande", () => {
    const wrong = parseFiberPlan(text.replace("271 116 50 2001", "271 116 50 2301"));
    expect(wrong.dayTypes[0].totalsCheck).toBe("da_verificare");
    expect(wrong.warnings.map(w => w.code)).toContain("totali_diversi");
  });

  it("legge pasti e macro stampati di ogni pasto", () => {
    expect(day("A").meals.map(m => m.name)).toEqual(["Colazione", "Pranzo", "Spuntino pomeriggio", "Cena"]);
    expect(meal("A", "Pranzo").printed).toEqual({ carbs: 90, protein: 45, fat: 18, kcal: 700 });
  });
});

describe("alimenti, alternative e note", () => {
  it("prima riga e righe con + aprono un gruppo, oppure aggiunge un'alternativa", () => {
    const groups = meal("A", "Pranzo").groups.map(describeGroup);
    expect(groups[0]).toEqual(["Pasta integrale 100g", "Farro 90g"]);
    expect(groups).toHaveLength(5);
  });

  it("un gruppo di alternative continua dopo il salto pagina", () => {
    const proteins = meal("A", "Pranzo").groups[1];
    expect(describeGroup(proteins)).toEqual(["Petto di pollo 140g", "Petto di tacchino 140g", "Merluzzo 200g", "Tonno al naturale 120g"]);
    expect(proteins.options[0].isDefault).toBe(true);
    expect(proteins.options[3].isDefault).toBe(false);
  });

  it("alternativa composta: pesce + olive", () => {
    const fish = meal("B", "Pranzo").groups[1].options[1];
    expect(fish.components).toEqual([
      { name: "Filetto di sgombro", qty: 110, unit: "g", raw: "Filetto di sgombro 110g" },
      { name: "Olive nere", qty: 20, unit: "g", raw: "Olive nere 20g" },
    ]);
  });

  it("la prima riga di un pasto può essere composta", () => {
    expect(describeGroup(meal("B", "Colazione").groups[0])).toEqual(["Pane integrale 60g + Marmellata 20g"]);
  });

  it("le note restano all'opzione giusta, anche con un indirizzo spezzato a fine riga", () => {
    const [pasta, farro] = meal("A", "Pranzo").groups[0].options;
    expect(pasta.notes).toEqual(["Marca: una qualsiasi di semola integrale."]);
    expect(farro.notes).toEqual([]);
    const yogurt = meal("A", "Colazione").groups[1].options[0];
    expect(yogurt.notes).toEqual(["Esempio di prodotto: https://www.esempio.it/prodotti/yogurt-bianco-magro.html - Senza zuccheri aggiunti."]);
  });

  it("unità originali: grammi con virgola, porzioni, uova grandi, percentuali nel nome", () => {
    const sale = meal("A", "Pranzo").groups[4].options[0].components[0];
    expect(sale).toMatchObject({ name: "Sale", qty: 1.5, unit: "g" });
    expect(meal("A", "Cena").groups[1].options[0].components[0]).toMatchObject({ name: "Uova", qty: 2, unit: "pezzo", size: "grande" });
    expect(meal("B", "Cena").groups[2].options[0].components[0]).toMatchObject({ name: "Cioccolato fondente 85%", qty: 10, unit: "g" });
  });

  it("la frutta a porzioni rimanda alla tabella, la verdura senza tabella va rivista dal coach", () => {
    expect(meal("A", "Spuntino pomeriggio").groups[0].options[0].components[0].portionRef).toBe("frutta");
    const missing = plan.warnings.filter(w => w.code === "porzione_senza_tabella");
    expect(missing).toHaveLength(1);
    expect(missing[0].message).toMatch(/Verdura/);
  });
});

describe("regole di frequenza", () => {
  it("il tonno al massimo una volta a settimana vale per tutti i pasti in cui compare", () => {
    expect(plan.frequencyRules).toEqual([
      { food: "Tonno al naturale", maxPerWeek: 1, appliesTo: ["A.pranzo.2.4", "A.cena.2.2"] },
    ]);
  });
});

describe("note: integratori e porzioni", () => {
  it("integratori tutti i giorni e a giorni alterni, con momento e dose", () => {
    expect(plan.supplements).toEqual([
      expect.objectContaining({ name: "Omega 3", product: "Olio di pesce", brand: "Marca Prova", dose: { qty: 2, unit: "capsula" },
        instructions: "durante il pasto", schedule: "daily", moment: "Al mattino" }),
      expect.objectContaining({ name: "Vitamina D3", dose: { qty: 1, unit: "capsula" }, schedule: "alternate",
        moment: "Dopo cena o 1h prima di dormire" }),
    ]);
    expect(plan.notes).toEqual(["Codice di esempio per lo sconto."]);
  });

  it("tabella porzioni con frazioni e regola per comporre la porzione", () => {
    const fruit = plan.portionTables[0];
    expect(fruit.key).toBe("frutta");
    expect(fruit.mixRule).toBe("dividi_per_numero_di_frutti");
    expect(fruit.entries.map(e => e.name)).toEqual(["Mela", "Kiwi", "Fichi", "Pompelmo", "Ananas", "Papaya"]);
    const by = name => fruit.entries.find(e => e.name === name);
    expect(by("Fichi").household).toMatchObject({ min: 2, max: 3, what: "fichi" });
    expect(by("Pompelmo").household).toMatchObject({ qty: 0.5, what: "pompelmo" });
    expect(by("Ananas").household).toBeNull();
    expect(by("Papaya")).toMatchObject({ qty: 300, unit: "g", household: null });
  });

  it("un testo finto ben formato non produce altri avvisi", () => {
    expect(plan.warnings.map(w => w.code)).toEqual(["porzione_senza_tabella"]);
  });
});

describe("pezzi di base", () => {
  it("ricompone le righe da frammenti pdf.js con coordinate", () => {
    const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });
    const lines = itemsToLines([
      item("Colazione", 37, 694.4), item("745", 511, 695.1), item("109", 369, 695.1),
      item("38", 416, 695.1), item("18", 464, 695.1), item("Corn", 36, 656.9), item("Flakes 80g", 60, 656.9),
      item("Creatina", 36, 600), item(":", 70, 600), item("1 capsula", 80, 600),
    ]);
    expect(lines).toEqual(["Colazione 109 38 18 745", "Corn Flakes 80g", "Creatina: 1 capsula"]);
  });

  it("quantità e misure casalinghe", () => {
    expect(parseFoodText("Latte 0,5l")).toMatchObject({ name: "Latte", qty: 500, unit: "ml" });
    expect(parseFoodText("Integratore EAA 5 capsule")).toMatchObject({ qty: 5, unit: "capsula" });
    expect(parseFoodText("Qualcosa a piacere")).toMatchObject({ qty: null, needsReview: true });
    expect(parseHousehold("mezza melagrana")).toMatchObject({ qty: 0.5, what: "melagrana" });
    expect(parseHousehold("")).toBeNull();
  });

  it("un testo che non è di Fiber dà un avviso chiaro", () => {
    const empty = parseFiberPlan("Lista della spesa\nPane\nLatte");
    expect(empty.dayTypes).toEqual([]);
    expect(empty.warnings.map(w => w.code)).toContain("nessun_giorno");
  });
});
