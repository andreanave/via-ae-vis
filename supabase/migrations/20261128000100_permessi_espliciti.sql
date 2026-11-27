-- Permessi espliciti per il ruolo "authenticated": i progetti Supabase recenti non li concedono
-- più in automatico. Chi vede cosa resta deciso dalle regole Row Level Security.
-- Il ruolo "anon" (utente non autenticato) non riceve nulla.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.studios, public.studio_members, public.care_links, public.invites,
  public.coach_notes, public.coach_tasks
  to authenticated;
grant select on public.profiles to authenticated;
-- Su profiles solo alcune colonne sono modificabili (ruolo e master no).
grant update (full_name, reminder_hours, telegram_url) on public.profiles to authenticated;
grant execute on function public.is_master(), public.is_professional_of(uuid, text), public.shares_care_link(uuid)
  to authenticated;
