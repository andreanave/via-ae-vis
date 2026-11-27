import { supabase } from "../../lib/supabase.js";
import { normalizeConfig } from "../../lib/checkinFields.js";

export const loadSettings = async athleteId => {
  const { data } = await supabase.from("checkin_settings").select("config, updated_at").eq("athlete_id", athleteId).maybeSingle();
  return data ? normalizeConfig(data.config) : null;
};

export const loadEntries = async (athleteId, fromDay, toDay) => {
  const { data, error } = await supabase.from("daily_entries").select("id, day, moment, values, status, updated_at")
    .eq("athlete_id", athleteId).gte("day", fromDay).lte("day", toDay);
  if (error) throw error;
  return data || [];
};

export const saveEntry = (athleteId, day, moment, values, status) =>
  supabase.from("daily_entries")
    .upsert({ athlete_id: athleteId, day, moment, values, status, updated_at: new Date().toISOString() },
      { onConflict: "athlete_id,day,moment" })
    .select("id, status, updated_at").single();

export const loadWeekly = async (athleteId, weekEnd) => {
  const { data } = await supabase.from("weekly_checkins").select("*").eq("athlete_id", athleteId).eq("week_end", weekEnd).maybeSingle();
  return data;
};
