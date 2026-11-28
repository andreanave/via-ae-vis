import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, UserPlus, Users } from "lucide-react";
import { useActor } from "../../lib/assist.jsx";
import { initials } from "../../lib/format.js";
import InviteForm from "./InviteForm.jsx";
import AthleteList, { useCoachAthletes } from "./AthleteList.jsx";

// All'apertura: l'elenco degli atleti, con il numero di cose che aspettano il coach.
// Su schermo largo è la colonna di sinistra della console (come nel design), la scheda si apre accanto.
export default function CoachConsole() {
  const actor = useActor();
  const { athletes, error } = useCoachAthletes(actor.id);
  const [inviting, setInviting] = useState(false);
  const canInvite = !actor.assisting && !inviting;

  const empty = athletes?.length === 0 && !error;
  return (
    <section className="coach-split">
      <aside className="coach-aside" aria-label="Elenco atleti">
        <AthleteList athletes={athletes} onInvite={canInvite ? () => setInviting(true) : undefined} />
      </aside>
      <div className="coach-main">
        <div className="page-head coach-phone-head" style={{ marginBottom: "1.5rem" }}>
          <span className="eyebrow">{athletes ? `${athletes.length} ${athletes.length === 1 ? "atleta" : "atleti"}` : "Atleti"}</span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "1rem" }}>
            <h1>I tuoi atleti</h1>
            {canInvite && (
              <button className="btn ghost" type="button" onClick={() => setInviting(true)}><UserPlus strokeWidth={1.5} aria-hidden="true" />Invita</button>
            )}
          </div>
        </div>
        {inviting && <div className="card" style={{ marginBottom: "1.5rem" }}><InviteForm onDone={() => setInviting(false)} /></div>}
        {error && <div className="notice error">{error}</div>}
        {athletes === null && <p className="muted coach-phone-only">Caricamento…</p>}
        {empty && !actor.isMaster && <p className="muted">Nessun atleta collegato. Invita il primo atleta per iniziare.</p>}
        {empty && actor.isMaster && (
          <div className="card">
            <p style={{ marginTop: 0 }}>Come master non segui atleti in prima persona.</p>
            <p className="muted">Per vedere l'app come un coach o un atleta degli studi apri Gestione e scegli «Vedi come».</p>
            <Link className="btn" to="/gestione">Apri Gestione</Link>
          </div>
        )}
        {athletes?.length > 0 && (
          <>
            <ul className="lines coach-phone-only">
              {athletes.map(a => (
                <li key={a.id} style={{ padding: 0 }}>
                  <Link to={`/atleti/${a.id}`} style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1, minHeight: 64, color: "inherit", textDecoration: "none" }}>
                    <span className="avatar" aria-hidden="true">{initials(a.full_name)}</span>
                    <span style={{ flex: 1, fontWeight: a.pending > 0 ? 500 : 400 }}>{a.full_name || "Atleta"}</span>
                    {a.pending > 0 && <span className="badge" aria-label={`${a.pending} cose da fare`}>{a.pending}</span>}
                    <ChevronRight strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="coach-pick">
              <Users size={28} strokeWidth={1.5} aria-hidden="true" />
              <p>Scegli un atleta dall'elenco per aprire la sua scheda.</p>
              {athletes.some(a => a.pending > 0) && (
                <Link className="btn" to={`/atleti/${athletes[0].id}`}>Apri {athletes[0].full_name || "il primo"}, {athletes[0].pending} da fare</Link>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
