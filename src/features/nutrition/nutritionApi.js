import { supabase } from "../../lib/supabase.js";
import { extractPdfPages } from "../../lib/fiber/pdfLines.js";
import { parseFiberPlan } from "../../lib/fiber/parseFiber.js";

const BUCKET = "nutrition-pdfs";
const COLUMNS = "id, title, version, valid_from, status, week_pattern, content, review, source_path, created_at, activated_at";

// Legge il PDF nel browser: il file non lascia il dispositivo finché il coach non salva.
export const readFiberPdf = async file => {
  const extracted = await extractPdfPages(file);
  const plan = parseFiberPlan(extracted, { fileName: extracted.fileName });
  return { plan, file };
};

export const listPlans = async athleteId => {
  const { data, error } = await supabase.from("nutrition_plans").select(COLUMNS)
    .eq("athlete_id", athleteId).order("version", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const loadActivePlan = async athleteId => {
  const { data, error } = await supabase.from("nutrition_plans").select(COLUMNS)
    .eq("athlete_id", athleteId).eq("status", "active").maybeSingle();
  if (error) throw error;
  return data;
};

// Salva la bozza, poi carica il PDF originale nella cartella dell'atleta.
export const saveDraft = async ({ athleteId, actorId, plan, file, title, validFrom, existing = [] }) => {
  const used = new Set(existing.map(p => p.version));
  let version = plan.version && !used.has(plan.version) ? plan.version : Math.max(0, ...used) + 1;
  const { data, error } = await supabase.from("nutrition_plans").insert({
    athlete_id: athleteId,
    created_by: actorId,
    title: title || "Piano alimentare",
    version,
    valid_from: validFrom || null,
    week_pattern: plan.weekPattern.length === 7 ? plan.weekPattern : [],
    content: plan,
    review: plan.warnings,
    parser_version: plan.parserVersion,
  }).select(COLUMNS).single();
  if (error) throw error;
  if (file) {
    const path = `${athleteId}/${data.id}.pdf`;
    const upload = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: true });
    if (!upload.error) {
      await supabase.from("nutrition_plans").update({ source_path: path }).eq("id", data.id);
      data.source_path = path;
    }
  }
  return data;
};

export const activatePlan = async planId => {
  const { error } = await supabase.rpc("activate_nutrition_plan", { plan: planId });
  if (error) throw error;
};

export const deleteDraft = async plan => {
  if (plan.source_path) await supabase.storage.from(BUCKET).remove([plan.source_path]);
  const { error } = await supabase.from("nutrition_plans").delete().eq("id", plan.id);
  if (error) throw error;
};

export const pdfUrl = async path => {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl || null;
};

// Intolleranze e allergie dell'atleta (dato sanitario: lo scrive solo chi segue l'alimentazione).
export const loadDietNotes = async athleteId => {
  const { data, error } = await supabase.from("athlete_diet_notes")
    .select("athlete_id, lactose_intolerant, allergens, other, updated_at").eq("athlete_id", athleteId).maybeSingle();
  if (error) throw error;
  return data;
};

export const saveDietNotes = async ({ athleteId, actorId, lactose_intolerant, allergens, other }) => {
  const { data, error } = await supabase.from("athlete_diet_notes").upsert({
    athlete_id: athleteId, lactose_intolerant, allergens, other: other?.trim() || null,
    updated_by: actorId, updated_at: new Date().toISOString(),
  }).select("athlete_id, lactose_intolerant, allergens, other, updated_at").single();
  if (error) throw error;
  return data;
};
