-- Applicato dal workflow "Dati di prova" (.github/workflows/demo-data.yml). Solo dati inventati.
-- Dati di prova FINTI per vedere l'app popolata (studio Vis æ Vis, coach Rugge).
-- Crea 5 atleti finti (e-mail @demo.invalid, non possono accedere) e riempie per loro e per Nave Test:
-- check-in giornalieri e settimanali delle ultime 8 settimane, schede e sedute svolte con i carichi,
-- chat, commenti ai check-in, promemoria e note del coach.
-- Si può rieseguire: cancella e ricrea gli atleti finti; per Nave Test rifà solo i dati prima di oggi
-- (le sedute e i check-in di oggi restano).
do $$
declare
  nave uuid := (select id from auth.users where email = 'atleta@test.it');
  coach uuid := (select id from auth.users where email = 'rugge@test.it');
  st uuid := (select id from public.studios where name = 'Vis ae Vis');
  today date := current_date;
  first_week_end date;
  cfg jsonb := '{"morning":["weight","sleep_hours","sleep_quality"],"evening":["steps","stress","fatigue","hunger","diet_adherence"],"weekly":[{"key":"weight","required":true,"locked":false},{"key":"sleep_hours","required":true,"locked":false},{"key":"sleep_quality","required":true,"locked":false},{"key":"steps","required":true,"locked":false},{"key":"workouts_done","required":true,"locked":false},{"key":"workouts_comment","required":false,"locked":false},{"key":"diet_adherence","required":true,"locked":false},{"key":"nutrition_notes","required":false,"locked":false},{"key":"stress","required":true,"locked":false},{"key":"fatigue","required":true,"locked":false},{"key":"hunger","required":true,"locked":false}],"weekday":0}';
  demo record;
  a uuid; cl uuid; p uuid; s uuid; w uuid; wid uuid;
  d date; we date; i int; i2 int; k int; n int; sess_ids uuid[]; sess_names text[];
  base_w numeric; trend numeric; ex record; load numeric; reps_lo int; wc uuid;
begin
  if nave is null or coach is null or st is null then raise exception 'utenti o studio di prova non trovati'; end if;
  perform setseed(0.42);

  -- 1. Pulizia dei dati finti precedenti
  delete from auth.users where email like '%@demo.invalid';
  delete from public.weekly_checkins where athlete_id = nave and week_end < today;
  delete from public.daily_entries where athlete_id = nave and day < today;
  delete from public.workout_logs where athlete_id = nave and performed_on < today;
  delete from public.coach_tasks where professional_id = coach;
  delete from public.messages where care_link_id in (select id from public.care_links where athlete_id = nave);

  -- 2. Atleti finti
  for demo in select * from (values
      ('giulia.bassi', 'Giulia Bassi', 61.0, -0.08, array['training','nutrition','checkin'], 'Ricomposizione. Si allena al mattino presto, poco tempo a pranzo.'),
      ('marco.riva', 'Marco Riva', 88.5, -0.25, array['training','checkin'], 'Fase di definizione. Ginocchio sinistro operato nel 2022: niente salti.'),
      ('sara.lodi', 'Sara Lodi', 57.2, 0.05, array['training','nutrition','checkin'], 'Prepara la prima gara di powerlifting a marzo.'),
      ('luca.ferri', 'Luca Ferri', 74.0, 0.10, array['training','checkin'], 'Massa pulita. Lavora su turni, allenamenti a orari variabili.'),
      ('elena.conti', 'Elena Conti', 66.8, -0.15, array['nutrition','checkin'], 'Solo alimentazione e check-in, si allena in autonomia in un altro centro.')
    ) as t(slug, name, weight, slope, modules, note)
  loop
    a := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', demo.slug || '@demo.invalid',
      extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', demo.name),
      now() - interval '70 days', now(), '', '', '', '');
    update public.profiles set full_name = demo.name, role = 'athlete' where id = a;
    insert into public.studio_members (studio_id, profile_id, role) values (st, a, 'member') on conflict do nothing;
    insert into public.care_links (athlete_id, professional_id, studio_id, modules, status, started_at)
      values (a, coach, st, demo.modules, 'active', now() - interval '60 days');
    insert into public.coach_notes (athlete_id, professional_id, body, updated_at) values (a, coach, demo.note, now() - interval '3 days')
      on conflict (athlete_id, professional_id) do update set body = excluded.body;
  end loop;

  -- 3. Per Nave Test e per gli atleti finti: check-in, allenamento, chat
  for demo in
    select pr.id, pr.full_name, cl2.id as link_id, cl2.modules,
      case pr.full_name when 'Nave Test' then 82.8 when 'Giulia Bassi' then 61.0 when 'Marco Riva' then 88.5
        when 'Sara Lodi' then 57.2 when 'Luca Ferri' then 74.0 else 66.8 end as weight,
      case pr.full_name when 'Nave Test' then -0.2 when 'Giulia Bassi' then -0.08 when 'Marco Riva' then -0.25
        when 'Sara Lodi' then 0.05 when 'Luca Ferri' then 0.10 else -0.15 end as slope,
      pr.full_name = 'Nave Test' as is_nave
    from public.care_links cl2 join public.profiles pr on pr.id = cl2.athlete_id
    where cl2.professional_id = coach and cl2.status = 'active'
  loop
    a := demo.id; cl := demo.link_id;

    -- Check-in
    if 'checkin' = any(demo.modules) then
      insert into public.checkin_settings (athlete_id, config, updated_by, updated_at) values (a, cfg, coach, now() - interval '56 days')
        on conflict (athlete_id) do update set config = excluded.config, updated_by = excluded.updated_by;
      -- giornalieri: 56 giorni fino a ieri (alcuni buchi), stamattina il mattino
      for i in 1..56 loop
        d := today - i;
        trend := demo.weight + demo.slope * (56 - i) / 7.0;
        if random() < 0.85 then
          insert into public.daily_entries (athlete_id, day, moment, "values", status, updated_at) values (a, d, 'morning',
            jsonb_build_object('weight', round((trend + (random() - 0.5) * 0.8)::numeric, 1),
              'sleep_hours', round((6.25 + random() * 2)::numeric * 4) / 4, 'sleep_quality', 5 + floor(random() * 5)::int),
            'done', d + time '07:30') on conflict do nothing;
        end if;
        if random() < 0.75 then
          insert into public.daily_entries (athlete_id, day, moment, "values", status, updated_at) values (a, d, 'evening',
            jsonb_build_object('steps', 5000 + floor(random() * 7000)::int, 'stress', 2 + floor(random() * 6)::int,
              'fatigue', 2 + floor(random() * 6)::int, 'hunger', 3 + floor(random() * 5)::int, 'diet_adherence', 6 + floor(random() * 5)::int),
            'done', d + time '22:15') on conflict do nothing;
        end if;
      end loop;
      if not demo.is_nave then
        insert into public.daily_entries (athlete_id, day, moment, "values", status, updated_at) values (a, today, 'morning',
          jsonb_build_object('weight', round((demo.weight + demo.slope * 8)::numeric, 1), 'sleep_hours', 7.5, 'sleep_quality', 7),
          'done', today + time '07:20') on conflict do nothing;
      end if;
      -- settimanali: le ultime 8 domeniche confermate, con riepilogo calcolato dai giornalieri
      first_week_end := today - extract(dow from today)::int; -- domenica scorsa
      for k in 0..7 loop
        we := first_week_end - 7 * k;
        insert into public.weekly_checkins (athlete_id, week_end, answers, notes, snapshot, status, confirmed_at, updated_at)
        select a, we,
          jsonb_build_object('workouts_comment', (array['Buone sensazioni, carichi in salita.', 'Una seduta saltata per lavoro.', 'Stanco a metà settimana, recuperato nel weekend.', 'Tutto regolare.'])[1 + floor(random() * 4)::int],
            'nutrition_notes', (array['Una cena fuori sabato.', 'Pasti rispettati.', 'Fame alta la sera.', ''])[1 + floor(random() * 4)::int]),
          '',
          jsonb_build_object(
            'weight', jsonb_build_object('value', round(avg(("values"->>'weight')::numeric) filter (where moment = 'morning'), 1), 'origin', 'computed', 'count', count(*) filter (where moment = 'morning' and "values" ? 'weight')),
            'sleep_hours', jsonb_build_object('value', round(avg(("values"->>'sleep_hours')::numeric) filter (where moment = 'morning'), 1), 'origin', 'computed'),
            'sleep_quality', jsonb_build_object('value', round(avg(("values"->>'sleep_quality')::numeric) filter (where moment = 'morning'), 1), 'origin', 'computed'),
            'steps', jsonb_build_object('value', round(avg(("values"->>'steps')::numeric) filter (where moment = 'evening')), 'origin', 'computed'),
            'stress', jsonb_build_object('value', round(avg(("values"->>'stress')::numeric) filter (where moment = 'evening'), 1), 'origin', 'computed'),
            'fatigue', jsonb_build_object('value', round(avg(("values"->>'fatigue')::numeric) filter (where moment = 'evening'), 1), 'origin', 'computed'),
            'hunger', jsonb_build_object('value', round(avg(("values"->>'hunger')::numeric) filter (where moment = 'evening'), 1), 'origin', 'computed'),
            'diet_adherence', jsonb_build_object('value', round(avg(("values"->>'diet_adherence')::numeric) filter (where moment = 'evening'), 1), 'origin', 'computed'),
            'workouts_done', jsonb_build_object('value', case when 'training' = any(demo.modules) then 2 + floor(random() * 2)::int else 3 end, 'origin', 'answer')),
          'confirmed', we + time '20:00', we + time '20:00'
        from public.daily_entries where athlete_id = a and day between we - 6 and we
        on conflict (athlete_id, week_end) do nothing;
      end loop;
      -- commento del coach sull'ultima settimana
      select id into wc from public.weekly_checkins where athlete_id = a and week_end = first_week_end;
      if wc is not null then
        insert into public.checkin_comments (weekly_checkin_id, author_id, field_key, kind, body, created_at)
          values (wc, coach, 'weight', 'comment', 'Andamento del peso in linea con l''obiettivo, continuiamo così.', first_week_end + time '21:30');
      end if;
    end if;

    -- Allenamento
    if 'training' = any(demo.modules) then
      select id into p from public.programs where athlete_id = a and status = 'active';
      if p is null then
        insert into public.programs (athlete_id, professional_id, name, notes, training_weekdays, status, starts_on)
          values (a, coach, 'Blocco ' || (array['forza', 'ipertrofia', 'base'])[1 + floor(random() * 3)::int],
            'Carichi da RIR 2. Annota le sensazioni a fine seduta.', array[1, 3, 5], 'draft', today - 56)
          returning id into p;
        insert into public.program_sessions (program_id, position, name, notes) values (p, 0, 'A · Parte alta', '') returning id into s;
        insert into public.session_exercises (session_id, position, name, sets, reps, load, rir, rest_seconds, bodyweight) values
          (s, 0, 'Panca piana con bilanciere', 4, '6-8', '50 kg', '2', 150, false),
          (s, 1, 'Rematore con manubrio', 4, '8-10', '22 kg', '2', 120, false),
          (s, 2, 'Alzate laterali', 3, '12-15', '6 kg', '1', 60, false);
        insert into public.program_sessions (program_id, position, name, notes) values (p, 1, 'B · Parte bassa', '') returning id into s;
        insert into public.session_exercises (session_id, position, name, sets, reps, load, rir, rest_seconds, bodyweight) values
          (s, 0, 'Squat con bilanciere', 4, '6-8', '60 kg', '2', 180, false),
          (s, 1, 'Stacco rumeno', 3, '8-10', '50 kg', '2', 150, false),
          (s, 2, 'Affondi con manubri', 3, '10-12', '12 kg', '1', 90, false);
        update public.programs set status = 'active' where id = p;
      else
        update public.programs set starts_on = today - 56 where id = p;
      end if;
      select array_agg(id order by position), array_agg(name order by position) into sess_ids, sess_names
        from public.program_sessions where program_id = p;
      n := 0;
      for i in reverse 56..1 loop
        d := today - i;
        if extract(isodow from d)::int in (1, 3, 5) then
          if random() < 0.12 then continue; end if; -- qualche seduta saltata
          k := (n % array_length(sess_ids, 1)) + 1; n := n + 1;
          wid := gen_random_uuid();
          insert into public.workout_logs (id, athlete_id, program_id, session_id, session_name, performed_on, status, notes, started_at, finished_at, client_updated_at, synced_at)
            values (wid, a, p, sess_ids[k], sess_names[k], d, 'done',
              (array['', '', 'Buona seduta.', 'Un po'' stanco.', 'Carichi saliti!'])[1 + floor(random() * 5)::int],
              d + time '18:30', d + time '19:40', d + time '19:40', d + time '19:41');
          for ex in select * from public.session_exercises where session_id = sess_ids[k] order by position loop
            load := coalesce(nullif(regexp_replace(replace(coalesce(ex.load, ''), ',', '.'), '[^0-9.]', '', 'g'), '')::numeric, case when ex.bodyweight then 0 else 20 end);
            load := load * (0.85 + 0.15 * (56 - i) / 56.0); -- progressione nelle 8 settimane
            load := round(load / 2.5) * 2.5;
            reps_lo := coalesce(nullif(regexp_replace(split_part(coalesce(ex.reps, '8'), '-', 1), '[^0-9]', '', 'g'), '')::int, 8);
            for i2 in 0..greatest(coalesce(ex.sets, 3), 1) - 1 loop
              insert into public.set_logs (id, workout_id, session_exercise_id, exercise_name, set_index, load, reps, note, done_at, client_updated_at)
                values (gen_random_uuid(), wid, ex.id, ex.name, i2, case when ex.bodyweight then null else load end,
                  reps_lo + floor(random() * 3)::int, '', d + time '18:40' + i2 * interval '3 minutes', d + time '19:40');
            end loop;
          end loop;
        end if;
      end loop;
    end if;

    -- Chat
    insert into public.messages (care_link_id, sender_id, body, created_at, read_at) values
      (cl, coach, 'Ciao ' || split_part(demo.full_name, ' ', 1) || ', ho visto il check-in di domenica. Come va questa settimana?', now() - interval '2 days 3 hours', now() - interval '2 days'),
      (cl, a, 'Tutto bene! Un po'' di fame la sera, ma tengo duro.', now() - interval '2 days', now() - interval '1 day 20 hours'),
      (cl, coach, 'Se serve sposta 20 g di carboidrati dal pranzo alla cena. Fammi sapere.', now() - interval '1 day 20 hours', now() - interval '1 day 2 hours');
    if demo.is_nave then
      insert into public.messages (care_link_id, sender_id, body, created_at, read_at) values
        (cl, coach, 'Oggi seduta A: occhio alla panca, prova 2,5 kg in più se le ripetizioni arrivano a 8.', now() - interval '5 hours', null);
    elsif random() < 0.6 then
      insert into public.messages (care_link_id, sender_id, body, created_at, read_at) values
        (cl, a, (array['Domanda: posso sostituire il riso con le patate?', 'Fastidio al gomito sui curl, fermato a 9.', 'Domani sono in trasferta, sposto l''allenamento a sabato.'])[1 + floor(random() * 3)::int],
         now() - interval '3 hours' - random() * interval '6 hours', null);
    end if;
  end loop;

  -- 4. Promemoria del coach
  insert into public.coach_tasks (professional_id, athlete_id, title, due_on, created_at)
  select coach, pr.id, t.title, today + t.days, now() - interval '1 day'
  from (values ('Giulia Bassi', 'Rivedere il pranzo dei giorni di riposo', 1), ('Marco Riva', 'Aggiornare la prossima scheda', 3),
               ('Sara Lodi', 'Programmare il picco per la gara di marzo', 7), ('Nave Test', 'Controllare i carichi della panca', 0),
               ('Elena Conti', 'Chiamata di controllo mensile', 2)) as t(name, title, days)
  join public.profiles pr on pr.full_name = t.name;

  -- 5. Notifiche: lette tutte quelle create dai dati finti, tranne i messaggi ancora da leggere
  update public.notifications set read_at = now()
    where read_at is null and recipient_id in (select athlete_id from public.care_links where professional_id = coach union select coach);
  update public.notifications nt set read_at = null
    where nt.kind = 'message' and exists (
      select 1 from public.messages m
      where nt.link = '/messaggi/' || m.care_link_id and m.read_at is null and m.sender_id <> nt.recipient_id);
end $$;
