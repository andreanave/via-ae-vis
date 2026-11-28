import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";

// Notifiche non lette dell'utente, aggiornate in tempo reale.
export function useUnreadCount(userId, enabled = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId || !enabled) { setCount(0); return undefined; }
    const load = () => supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("recipient_id", userId).is("read_at", null).then(({ count: c }) => setCount(c || 0));
    load();
    const channel = supabase.channel(`notif-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, load)
      .subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { supabase.removeChannel(channel); window.removeEventListener("focus", onFocus); };
  }, [userId, enabled]);
  return count;
}
