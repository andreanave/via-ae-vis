// Estrazione del testo dal PDF esportato da Fiber. Il PDF ha testo selezionabile: niente OCR.
// pdf.js restituisce frammenti con coordinate; li ricomponiamo in righe dall'alto verso il basso.

const clean = value => String(value || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim();

// I numeri dei macro di un pasto stanno meno di un punto più in alto del suo nome: tolleranza 2pt.
export const itemsToLines = (items = [], yTolerance = 2) => {
  const lines = [];
  for (const item of items) {
    const text = clean(item?.str);
    if (!text) continue;
    const x = Number(item?.transform?.[4]) || 0;
    const y = Number(item?.transform?.[5]) || 0;
    let line = lines.find(l => Math.abs(l.y - y) <= yTolerance);
    if (!line) lines.push((line = { y, parts: [] }));
    line.parts.push({ x, text });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map(l => l.parts.sort((a, b) => a.x - b.x).map(p => p.text).join(" ").replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim())
    .filter(Boolean);
};

// Restituisce [{ page, lines: [...] }] e i metadati del documento.
export const extractPdfPages = async (file, { maxPages = 30 } = {}) => {
  const isPdf = file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));
  if (!isPdf) throw new Error("Seleziona il PDF esportato da Fiber.");
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import("pdfjs-dist/build/pdf.mjs"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push({ page: n, lines: itemsToLines(content.items) });
    page.cleanup();
  }
  const meta = await doc.getMetadata().catch(() => null);
  await task.destroy();
  return { pages, totalPages: doc.numPages, title: meta?.info?.Title || "", fileName: file.name || "" };
};
