import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { useAssist } from "../../lib/assist.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import { initials } from "../../lib/format.js";
import { rpcErrorMessage } from "../../lib/rpcErrors.js";
import InviteForm from "../coach/InviteForm.jsx";
import { UserPlus } from "lucide-react";

const ROLE_LABEL = { athlete: "Atleta", professional: "Professionista" };

// Console del master: tutti gli account, invito dei professionisti, accesso in assistenza.
export default function MasterConsole() {
  const { user } = useAuth();
  const { start } = useAssist();
  const navigate = useNavigate();
  const [people, setPeople] = useState(null);
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    supabase.from("profiles").select("id, full_name, role, is_master, created_at").order("full_name")
      .then(({ data, error: err }) => { if (err) setError("Non riesco a caricare gli account."); setPeople(data || []); });
  useEffect(() => { load(); }, []);

  const changeRole = async (person, role) => {
    const { error: err } = await supabase.rpc("set_user_role", { target: person.id, new_role: role });
    if (err) { setError(rpcErrorMessage(err)); return; }
    load();
  };

  const assist = person => { start({ id: person.id, full_name: person.full_name, role: person.role }); navigate("/"); };

  const q = query.trim().toLowerCase();
  const visible = (people || []).filter(p => p.id !== user.id && (!q || (p.full_name || "").toLowerCase().includes(q)));

  return (
    <section className="page">
      <div className="section-head">
        <div className="page-head">
          <span className="eyebrow">{people ? `${people.length} account` : "Account"}</span>
          <h1>Gestione</h1>
        </div>
        {!inviting && (
          <button className="btn ghost" type="button" onClick={() => setInviting(true)}>
            <UserPlus size={18} strokeWidth={1.5} aria-hidden="true" />Invita professionista
          </button>
        )}
      </div>
      {inviting && <div className="card flat"><InviteForm kind="professional" onDone={() => setInviting(false)} /></div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <input className="input" type="search" placeholder="Cerca per nome" aria-label="Cerca account" value={query}
        onChange={e => setQuery(e.target.value)} />
      {people === null && <p className="muted">Caricamento…</p>}
      <ul className="lines">
        {visible.map(p => (
          <li key={p.id} className="person">
            <span className="avatar" aria-hidden="true">{initials(p.full_name)}</span>
            <span className="person-name">
              {p.full_name || "Senza nome"}
              <span className="muted"> · {ROLE_LABEL[p.role]}</span>
            </span>
            <select className="input" aria-label={`Ruolo di ${p.full_name}`} value={p.role}
              onChange={e => changeRole(p, e.target.value)}>
              <option value="athlete">Atleta</option>
              <option value="professional">Professionista</option>
            </select>
            <button className="btn ghost" type="button" onClick={() => assist(p)}>Vedi come</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
