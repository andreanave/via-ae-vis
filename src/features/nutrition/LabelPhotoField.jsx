import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { NUTRIENTS } from "../../lib/foodMath.js";
import { uploadLabelPhoto } from "../../lib/labelPhoto.js";

// Foto della tabella nutrizionale. Con la foto e tutte le cifre leggibili il prodotto è approvato subito;
// se qualche cifra non si legge resta da verificare per il master.
export default function LabelPhotoField({ path, onPath, unreadable, onUnreadable }) {
  const [preview, setPreview] = useState("");
  const [state, setState] = useState("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setState("uploading");
    onPath("");
    try {
      onPath(await uploadLabelPhoto(file));
      setState("");
    } catch {
      setState("error");
    }
  };

  const toggle = key => onUnreadable(unreadable.includes(key) ? unreadable.filter(k => k !== key) : [...unreadable, key]);

  return (
    <div className="label-photo">
      <span className="label">Foto dell'etichetta (facoltativa)</span>
      {preview && <img src={preview} alt="Etichetta fotografata" />}
      <label className="btn secondary file-btn">
        <Camera aria-hidden="true" />
        {preview ? "Rifai la foto" : "Fotografa la tabella nutrizionale"}
        <input type="file" accept="image/*" capture="environment" onChange={pick} aria-label="Fotografa la tabella nutrizionale" />
      </label>
      {state === "uploading" && <p className="muted hint">Carico la foto…</p>}
      {state === "error" && <div className="notice error" role="alert">La foto non è stata caricata. Riprova.</div>}
      {path && (
        <>
          <span className="muted hint">C'è qualche valore che non si legge nella foto?</span>
          <div className="chips" role="group" aria-label="Valori illeggibili">
            {NUTRIENTS.map(({ key, label }) => (
              <button key={key} type="button" className="chip" aria-pressed={unreadable.includes(key)} onClick={() => toggle(key)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
