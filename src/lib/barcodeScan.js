// Lettura dei codici a barre dalla fotocamera.
// Usa il BarcodeDetector del browser dove c'è (Chrome su Android); altrove, iPhone compreso, carica solo al primo
// uso un lettore WebAssembly (barcode-detector / zxing-wasm) servito dall'app stessa, senza CDN esterni.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

let detectorPromise = null;

async function createDetector() {
  if ("BarcodeDetector" in globalThis) {
    try {
      const supported = await globalThis.BarcodeDetector.getSupportedFormats();
      const formats = FORMATS.filter(f => supported.includes(f));
      if (formats.length) return new globalThis.BarcodeDetector({ formats });
    } catch {
      // si passa al lettore WebAssembly
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
  });
  return new BarcodeDetector({ formats: FORMATS });
}

export function getDetector() {
  if (!detectorPromise) detectorPromise = createDetector().catch(err => { detectorPromise = null; throw err; });
  return detectorPromise;
}

export const cameraAvailable = () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);

// Codice EAN/UPC valido (cifra di controllo corretta): scarta letture parziali.
export function validGtin(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
