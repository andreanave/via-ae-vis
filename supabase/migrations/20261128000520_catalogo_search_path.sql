-- Catalogo alimentare: search_path fisso anche per le due funzioni di supporto alla ricerca
-- (avviso "Function Search Path Mutable" del linter di Supabase).
alter function public.food_norm(text) set search_path = public;
alter function public.foods_set_search() set search_path = public;
