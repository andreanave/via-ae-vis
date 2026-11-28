import { supabase } from "./supabase.js";

const unwrap = ({ data, error }) => { if (error) throw error; return data; };

export const searchFoods = (q, maxRows = 25) =>
  supabase.rpc("search_foods", { q, max_rows: maxRows }).then(unwrap);

export const addFood = (food, vals) => supabase.rpc("add_food", { food, vals }).then(unwrap);

export const addFoodVersion = (fid, vals) => supabase.rpc("add_food_version", { fid, vals }).then(unwrap);

export const verifyFood = fid => supabase.rpc("verify_food", { fid }).then(unwrap);

export const mergeFood = (duplicate, target) => supabase.rpc("merge_food", { duplicate, target }).then(unwrap);

const FOOD_COLUMNS = "id, kind, name, brand, variant, category, state, basis, edible_part_pct, unit_weight_g, portion_g, " +
  "portion_label, drained_weight_g, barcode, source, source_ref, status, merged_into, created_at, aliases, " +
  "current:food_versions!foods_current_version(*), creator:profiles!foods_created_by_fkey(full_name)";

export const getFood = id =>
  supabase.from("foods").select(FOOD_COLUMNS).eq("id", id).single().then(unwrap);

export const foodVersions = id =>
  supabase.from("food_versions").select("*").eq("food_id", id).order("version", { ascending: false }).then(unwrap);

// Voci inserite da atleti e coach che il master deve controllare (le approvate da etichetta in coda).
export const foodsToReview = () =>
  supabase.from("foods").select(FOOD_COLUMNS).neq("status", "verified").is("merged_into", null)
    .order("status", { ascending: false }).order("created_at", { ascending: true }).then(unwrap);
