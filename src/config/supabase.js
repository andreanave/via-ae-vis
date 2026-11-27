// Dati pubblici del progetto Supabase. La chiave "publishable" è pensata per stare nel browser:
// la protezione dei dati è affidata alle regole Row Level Security del database.
// Le chiavi segrete non vanno MAI in questa repository.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://eizgzpfkumigvfzjaudu.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_yzFtyPEJvKCaU8HV_K1FWg_E_47OpX-";
