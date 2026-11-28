import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { dayTypeFor } from "../../lib/fiber/planDay.js";
import { loadActivePlan } from "./nutritionApi.js";

// Riga (li) della lista "La giornata" nella Home dell'atleta verso il piano alimentare, solo se ce n'è uno attivo.
export default function NutritionShortcut({ athleteId }) {
  const [plan, setPlan] = useState(null);
  useEffect(() => {
    let active = true;
    loadActivePlan(athleteId).then(p => active && setPlan(p)).catch(() => {});
    return () => { active = false; };
  }, [athleteId]);
  if (!plan) return null;
  const day = dayTypeFor(plan.content);
  return (
    <li style={{ padding: 0 }}>
      <Link to="/alimentazione" style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1, minHeight: 52, color: "inherit", textDecoration: "none" }}>
        <span style={{ flex: 1 }}>Piano alimentare{day ? <span className="muted"> · oggi {day.label.toLowerCase()}</span> : null}</span>
        <ChevronRight strokeWidth={1.5} color="var(--text-2)" aria-hidden="true" />
      </Link>
    </li>
  );
}
