import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { useActor } from "../../lib/assist.jsx";
import TaskList from "./TaskList.jsx";

// Agenda del coach: tutti i promemoria aperti, anche quelli non legati a un atleta.
export default function Agenda() {
  const actor = useActor();
  const [names, setNames] = useState({});

  useEffect(() => {
    supabase.from("care_links").select("athlete:profiles!care_links_athlete_id_fkey(id, full_name)")
      .eq("professional_id", actor.id)
      .then(({ data }) => setNames(Object.fromEntries((data || []).filter(r => r.athlete).map(r => [r.athlete.id, r.athlete.full_name]))));
  }, [actor.id]);

  return (
    <section>
      <h1>Agenda</h1>
      <div className="card">
        <TaskList professionalId={actor.id} athleteNames={names} readOnly={actor.assisting} />
      </div>
    </section>
  );
}
