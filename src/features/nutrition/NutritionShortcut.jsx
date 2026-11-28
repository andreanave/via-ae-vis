import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { dayTypeFor } from "../../lib/fiber/planDay.js";
import { loadActivePlan } from "./nutritionApi.js";

// Riga (li) della lista "La giornata" nella Home dell'atleta verso il piano alimentare, solo se ce n'è uno attivo.
// Con showEmpty la riga resta anche senza piano, così l'atleta sa dove lo troverà.
export default function NutritionShortcut({ athleteId, showEmpty = false }) {
  const [plan, setPlan] = useState(undefined);
  useEffect(() => {
    let active = true;
    loadActivePlan(athleteId).then(p => active && setPlan(p || null)).catch(() => active && setPlan(null));
    return () => { active = false; };
  }, [athleteId]);
  if (plan === undefined || (!plan && !showEmpty)) return null;
  const day = plan ? dayTypeFor(plan.content) : null;
  return (
    <li style={{ padding: 0 }}>
      <Link to="/alimentazione" style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1, minHeight: 52, color: "inherit", textDecoration: "none" }}>
        <span style={{ flex: 1 }}>Piano alimentare{day ? <span className="muted"> · oggi {day.label.toLowerCase()}</span> : null}{!plan ? <span className="muted"> · non ancora caricato</span> : null}</span>
        <ChevronRight strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" />
      </Link>
    </li>
  );
}
