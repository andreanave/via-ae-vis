import { describe, expect, it } from "vitest";
import { matchFood, nameVariants, normalize, scoreCandidate, searchQueries, stateHint } from "../src/lib/foodMatch.js";

const catalog = [
  { id: 1, name: "Riso, brillato", state: "raw", status: "verified" },
  { id: 2, name: "Riso, brillato, cotto, bollito", state: "cooked", status: "verified" },
  { id: 3, name: "Grana Padano, DOP", state: null, status: "verified" },
  { id: 4, name: "Parmigiano Reggiano DOP", state: null, status: "verified" },
  { id: 5, name: "Tonno sott'olio, sgocciolato", state: "drained", status: "verified" },
  { id: 6, name: "Tonno", state: null, status: "verified" },
  { id: 7, name: "Pollo, petto, crudo", state: "raw", status: "verified" },
];
// Stessa regola di search_foods: tutte le parole devono comparire.
const search = async q => catalog.filter(f => normalize(f.name).split(" ").length && q.split(" ").every(w => normalize(f.name).includes(w)));

describe("abbinamento nomi del piano al catalogo", () => {
  it("normalizza accenti, apostrofi e maiuscole", () => {
    expect(normalize("Caffè d'orzo")).toBe("caffe d orzo");
  });

  it("separa le alternative scritte con la barra", () => {
    expect(nameVariants("Grana Padano / Parmigiano reggiano")).toEqual(["Grana Padano", "Parmigiano reggiano"]);
  });

  it("riconosce lo stato dal nome", () => {
    expect(stateHint("Riso cotto")).toBe("cooked");
    expect(stateHint("Tonno al naturale sgocciolato")).toBe("drained");
    expect(stateHint("Riso")).toBe(null);
  });

  it("allarga la ricerca togliendo parole", () => {
    expect(searchQueries("Petto di pollo ai ferri")).toEqual(["petto pollo ferri", "petto pollo", "petto"]);
  });

  it("senza indicazioni preferisce il crudo", () => {
    expect(scoreCandidate("Riso", catalog[0])).toBeGreaterThan(scoreCandidate("Riso", catalog[1]));
    expect(scoreCandidate("Riso cotto", catalog[1])).toBeGreaterThan(scoreCandidate("Riso cotto", catalog[0]));
  });

  it("abbina ciascuna alternativa", async () => {
    const res = await matchFood("Grana Padano / Parmigiano reggiano", search);
    expect(res.map(r => r.best?.id)).toEqual([3, 4]);
    expect(res.every(r => r.confident)).toBe(true);
  });

  it("trova il pollo anche con parole in più e in altro ordine", async () => {
    const [r] = await matchFood("Petto di pollo ai ferri", search);
    expect(r.best?.id).toBe(7);
  });

  it("non inventa un abbinamento", async () => {
    const [r] = await matchFood("Piadina", search);
    expect(r.best).toBe(null);
    expect(r.confident).toBe(false);
  });
});
