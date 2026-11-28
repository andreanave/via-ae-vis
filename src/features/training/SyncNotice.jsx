// Stato dell'invio delle sedute salvate sul telefono.
export default function SyncNotice({ pending, offline, onSync }) {
  if (!pending && !offline) return null;
  if (pending && !offline) {
    return (
      <div className="muted sync-line" role="status">
        <span>Salvato sul telefono, invio in corso…</span>
        <button type="button" className="btn link" onClick={onSync}>Invia ora</button>
      </div>
    );
  }
  return (
    <div className="notice warning sync-line" role="status">
      <span>
        {pending
          ? `Sei offline. ${pending === 1 ? "Una seduta è salvata" : `${pending} sedute sono salvate`} sul telefono e partirà da sola appena torni online.`
          : "Sei offline: stai vedendo la copia della scheda salvata sul telefono."}
      </span>
      {pending > 0 && <button type="button" className="btn link" onClick={onSync}>Riprova</button>}
    </div>
  );
}
