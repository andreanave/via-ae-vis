import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useActor } from "../../lib/assist.jsx";
import { dayTypeFor } from "../../lib/fiber/planDay.js";
import PlanView from "./PlanView.jsx";
import { loadActivePlan } from "./nutritionApi.js";

// Il piano alimentare visto dall'atleta: si apre sul tipo di giorno di oggi.
export default function AthletePlan() {
  const actor = useActor();
  const [plan, setPlan] = useState(undefined);
  useEffect(() => {
    let active = true;
    loadActivePlan(actor.id).then(p => active && setPlan(p)).catch(() => active && setPlan(null));
    return () => { active = false; };
  }, [actor.id]);

  const today = new Date();
  const day = plan ? dayTypeFor(plan.content, today) : null;
  return (
    <section className="stack" style={{ maxWidth: 640, margin: "0 auto", gap: "1.5rem" }}>
      <div>
        <Link to="/" className="back"><ChevronLeft strokeWidth={1.5} aria-hidden="true" />Oggi</Link>
        <div className="page-head" style={{ marginTop: "0.5rem" }}>
          <span className="eyebrow">Alimentazione</span>
          <h1>{day ? `Oggi: ${day.label.toLowerCase()}` : "Piano alimentare"}</h1>
        </div>
      </div>
      {plan === undefined && <p className="muted">Caricamento…</p>}
      {plan === null && <p className="muted">Non hai ancora un piano alimentare attivo.</p>}
      {plan && <PlanView key={plan.id} content={plan.content} initialDay={day?.key} date={today} />}
    </section>
  );
}
