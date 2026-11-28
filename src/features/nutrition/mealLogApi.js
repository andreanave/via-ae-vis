import { supabase } from "../../lib/supabase.js";

const COLUMNS = "id, athlete_id, day, kind, item_key, item_name, plan_id, status, choices, choice_names, note, created_at, updated_at";

export const loadMealLogs = async (athleteId, fromDay, toDay = fromDay) => {
  const { data, error } = await supabase.from("meal_logs").select(COLUMNS)
    .eq("athlete_id", athleteId).gte("day", fromDay).lte("day", toDay).order("day");
  if (error) throw error;
  return data || [];
};

// Registra (o aggiorna) un pasto o un integratore del giorno.
export const saveMealLog = async ({ athleteId, day, kind = "meal", key, name, planId = null, status = "done", choices = {}, choiceNames = [], note = "" }) => {
  const { data, error } = await supabase.from("meal_logs").upsert({
    athlete_id: athleteId, day, kind, item_key: key, item_name: name, plan_id: planId, status,
    choices, choice_names: choiceNames, note: note.trim(), created_by: athleteId, updated_at: new Date().toISOString(),
  }, { onConflict: "athlete_id,day,kind,item_key" }).select(COLUMNS).single();
  if (error) throw error;
  return data;
};

export const deleteMealLog = async id => {
  const { error } = await supabase.from("meal_logs").delete().eq("id", id);
  if (error) throw error;
};

export const loadDayTimes = async athleteId => {
  const { data } = await supabase.from("profiles").select("day_times").eq("id", athleteId).maybeSingle();
  return data?.day_times || {};
};

export const saveDayTimes = async (athleteId, times) => {
  const { error } = await supabase.from("profiles").update({ day_times: times }).eq("id", athleteId);
  if (error) throw error;
};
