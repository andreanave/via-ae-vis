import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getDetector, validGtin } from "../../lib/barcodeScan.js";

// Inquadra un codice a barre con la fotocamera posteriore. Si chiude da solo alla prima lettura valida.
// Il video resta sul telefono: nessuna immagine viene inviata o salvata.
export default function BarcodeScanner({ onDetected, onClose }) {
  const video = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const detected = useRef(onDetected);
  detected.current = onDetected;

  useEffect(() => {
    let stream = null;
    let stopped = false;
    let timer = null;

    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
        });
        if (stopped) { stop(); return; }
        const el = video.current;
        el.srcObject = stream;
        await el.play();
        const detector = await getDetector();
        if (stopped) return;
        setReady(true);
        const tick = async () => {
          if (stopped) return;
          try {
            if (el.readyState >= 2) {
              const found = await detector.detect(el);
              const hit = found.map(b => b.rawValue).find(validGtin);
              if (hit) {
                navigator.vibrate?.(60);
                stop();
                detected.current(hit);
                return;
              }
            }
          } catch {
            // fotogramma non leggibile: si riprova
          }
          timer = setTimeout(tick, 150);
        };
        tick();
      } catch (err) {
        if (stopped) return;
        setError(err?.name === "NotAllowedError"
          ? "Serve il permesso di usare la fotocamera. Puoi darlo dalle impostazioni del browser, oppure scrivere il codice a mano."
          : "Non riesco ad aprire la fotocamera. Scrivi il codice a mano.");
      }
    })();
    return stop;
  }, []);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Leggi il codice a barre">
      <div className="scanner-head">
        <span>{error ? "Fotocamera non disponibile" : ready ? "Inquadra il codice a barre" : "Apro la fotocamera…"}</span>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="Chiudi">
          <X aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <div className="notice error" role="alert">{error}</div>
      ) : (
        <div className="scanner-view">
          <video ref={video} playsInline muted />
          <div className="scanner-frame" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
