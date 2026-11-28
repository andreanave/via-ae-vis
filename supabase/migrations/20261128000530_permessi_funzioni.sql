-- Funzioni di servizio: eseguibili solo da utenti autenticati (non da anon), segnalato dal linter di Supabase.
-- Le funzioni che risalgono all'atleta da un id restituiscono l'atleta solo a chi può già vedere quei dati.

revoke execute on function
  public.is_master(), public.is_professional_of(uuid, text), public.shares_care_link(uuid),
  public.can_read_checkin(uuid), public.can_read_training(uuid),
  public.program_athlete(uuid), public.session_athlete(uuid), public.workout_athlete(uuid),
  public.is_studio_owner(uuid)
  from public, anon;
grant execute on function
  public.is_master(), public.is_professional_of(uuid, text), public.shares_care_link(uuid),
  public.can_read_checkin(uuid), public.can_read_training(uuid),
  public.program_athlete(uuid), public.session_athlete(uuid), public.workout_athlete(uuid),
  public.is_studio_owner(uuid)
  to authenticated;

-- La funzione del trigger di registrazione non va chiamata direttamente da nessuno.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.program_athlete(program uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select athlete_id from programs where id = program and public.can_read_training(athlete_id);
$$;
create or replace function public.session_athlete(session uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.athlete_id from program_sessions s join programs p on p.id = s.program_id
  where s.id = session and public.can_read_training(p.athlete_id);
$$;
create or replace function public.workout_athlete(workout uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select athlete_id from workout_logs where id = workout and public.can_read_training(athlete_id);
$$;
