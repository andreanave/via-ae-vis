import { describe, expect, it } from "vitest";
import { validGtin } from "../src/lib/barcodeScan.js";

describe("codici a barre letti dalla fotocamera", () => {
  it("accetta EAN-13, EAN-8 e UPC-A con la cifra di controllo giusta", () => {
    expect(validGtin("8001505005707")).toBe(true);
    expect(validGtin("96385074")).toBe(true);
    expect(validGtin("036000291452")).toBe(true);
  });
  it("scarta letture parziali o con la cifra di controllo sbagliata", () => {
    expect(validGtin("8001505005708")).toBe(false);
    expect(validGtin("800150500570")).toBe(false);
    expect(validGtin("abc")).toBe(false);
    expect(validGtin("")).toBe(false);
  });
});
