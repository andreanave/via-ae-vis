import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { formatDay } from "../../lib/format.js";
import PlanSuggestions from "./PlanSuggestions.jsx";
import PlanView from "./PlanView.jsx";
import { activatePlan, deleteDraft, listPlans, pdfUrl, readFiberPdf, saveDraft } from "./nutritionApi.js";

const STATUS = { draft: "Bozza", active: "Attivo", archived: "Archiviato" };

// Piano alimentare nella scheda atleta: import del PDF Fiber, revisione, attivazione e storico delle versioni.
export default function NutritionPanel({ athleteId, actorId, readOnly }) {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null); // { plan, file, title, validFrom }
  const [openId, setOpenId] = useState(null);
  const fileRef = useRef(null);

  const reload = () => listPlans(athleteId).then(setPlans).catch(() => setError("Non riesco a caricare i piani."));
  useEffect(() => { reload(); }, [athleteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setBusy(true);
    try {
      const { plan } = await readFiberPdf(file);
      if (!plan.dayTypes.length) setError("Non ho trovato pasti in questo PDF. È il PDF esportato da Fiber?");
      else setDraft({ plan, file, title: "Piano alimentare", validFrom: plan.startDate || "" });
    } catch (err) {
      setError(err.message || "Non riesco a leggere il PDF.");
    } finally { setBusy(false); }
  };

  const run = async fn => {
    setError(""); setBusy(true);
    try { await fn(); await reload(); } catch (err) { setError(err.message || "Operazione non riuscita."); }
    finally { setBusy(false); }
  };

  const save = activate => run(async () => {
    const saved = await saveDraft({ athleteId, actorId, ...draft, existing: plans || [] });
    if (activate) await activatePlan(saved.id);
    setDraft(null);
    setOpenId(saved.id);
  });

  const openPdf = async path => {
    const url = await pdfUrl(path);
    if (url) window.open(url, "_blank", "noopener");
  };

  if (draft) {
    const { plan } = draft;
    return (
      <div className="stack" style={{ gap: "1rem" }}>
        <p className="muted" style={{ margin: 0 }}>
          Controlla il piano letto dal PDF{draft.file?.name ? ` «${draft.file.name}»` : ""} prima di salvarlo.
          {plan.athleteName ? ` Intestato a: ${plan.athleteName}.` : ""}
        </p>
        {plan.warnings.length > 0 && (
          <div className="notice warning" role="status">
            <strong>Da controllare</strong>
            <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
              {[...new Set(plan.warnings.map(w => w.message))].map(m => <li key={m}>{m}</li>)}
            </ul>
          </div>
        )}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 2, minWidth: 200 }}>
            <label htmlFor="np-title">Nome del piano</label>
            <input id="np-title" className="input" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="np-from">Valido dal</label>
            <input id="np-from" type="date" className="input" value={draft.validFrom} onChange={e => setDraft({ ...draft, validFrom: e.target.value })} />
          </div>
        </div>
        {plan.weekPattern.length === 7 && (
          <p className="muted num" style={{ margin: 0, fontSize: "0.9rem" }}>
            Settimana: {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d, i) => `${d} ${plan.weekPattern[i]}`).join(" · ")}
          </p>
        )}
        <PlanSuggestions content={plan} planKey={`bozza:${draft.file?.name || ""}`} />
        <PlanView content={plan} />
        {error && <p className="notice error" role="alert">{error}</p>}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={busy} onClick={() => save(true)}>Salva e attiva</button>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => save(false)}>Salva come bozza</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setDraft(null)}>Annulla</button>
        </div>
      </div>
    );
  }

  const open = plans?.find(p => p.id === openId);
  return (
    <div className="stack" style={{ gap: "1rem" }}>
      {!readOnly && (
        <div>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={onFile} />
          <button type="button" className="btn secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            <FileUp strokeWidth={1.5} aria-hidden="true" />{busy ? "Lettura…" : "Importa PDF Fiber"}
          </button>
        </div>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      {plans === null ? <p className="muted">Caricamento…</p> : plans.length === 0 ? (
        <p className="muted">Nessun piano alimentare. Importa il PDF esportato da Fiber.</p>
      ) : (
        <ul className="list">
          {plans.map(p => (
            <li key={p.id} className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <button type="button" className="btn ghost" style={{ flex: 1, justifyContent: "flex-start", textAlign: "left" }}
                aria-expanded={openId === p.id} onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                <span>{p.title} · v{p.version}{p.valid_from ? ` · dal ${formatDay(p.valid_from)}` : ""}</span>
              </button>
              <span className="badge">{STATUS[p.status]}</span>
              {p.source_path && <button type="button" className="btn ghost" onClick={() => openPdf(p.source_path)}>PDF</button>}
              {!readOnly && p.status === "draft" && (
                <>
                  <button type="button" className="btn" disabled={busy} onClick={() => run(() => activatePlan(p.id))}>Attiva</button>
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => run(() => deleteDraft(p))}>Elimina</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <>
          <PlanSuggestions key={`s-${open.id}`} content={open.content} planKey={open.id} />
          <PlanView key={open.id} content={open.content} />
        </>
      )}
    </div>
  );
}
