import { createContext, useContext, useState } from "react";
import { useAuth } from "../features/auth/AuthProvider.jsx";

// Modalità assistenza del master: mostra l'app come un coach o un atleta specifico.
// Le letture usano i permessi completi del master; le scritture restano a nome del master.
const AssistContext = createContext(null);
const KEY = "app.assistAs";

const load = () => {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; }
};

export function AssistProvider({ children }) {
  const [viewAs, setViewAs] = useState(load);
  const start = target => {
    setViewAs(target);
    try { sessionStorage.setItem(KEY, JSON.stringify(target)); } catch { /* ignora */ }
  };
  const stop = () => {
    setViewAs(null);
    try { sessionStorage.removeItem(KEY); } catch { /* ignora */ }
  };
  return <AssistContext.Provider value={{ viewAs, start, stop }}>{children}</AssistContext.Provider>;
}

export const useAssist = () => useContext(AssistContext);

// Identità "effettiva" con cui costruire le schermate.
export function useActor() {
  const { profile, user } = useAuth();
  const { viewAs } = useAssist();
  const isMaster = Boolean(profile?.is_master);
  if (isMaster && viewAs) {
    return { id: viewAs.id, fullName: viewAs.full_name, role: viewAs.role, isMaster: false, assisting: true };
  }
  return {
    id: user?.id,
    fullName: profile?.full_name || "",
    role: profile?.role || "athlete",
    isMaster,
    assisting: false,
  };
}
