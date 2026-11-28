-- Dati di prova per l'app (solo account finti @test.it, nessun dato reale).
-- Li applica .github/workflows/seed.yml quando questo file cambia su main.
-- Si può rieseguire: gli identificativi sono fissi e ogni inserimento salta le righe già presenti.
-- Le date sono relative al giorno in cui gira lo script.
do $seed$
declare
  coach uuid := (select id from auth.users where email = 'rugge@test.it');
  studio uuid;
  src_program uuid;
  ath record;
  a uuid;
  link uuid;
  prog uuid;
  d date;
  i int;
  k int;
  n int;
  sess record;
  ex record;
  wid uuid;
  base numeric;
  w_end date;
  cur_end date := current_date + ((7 - extract(dow from current_date)::int) % 7);
  snap jsonb;
  cnt int;
  wdays int[];
begin
  if coach is null then raise notice 'rugge@test.it non esiste: niente da fare'; return; end if;
  select studio_id into studio from studio_members where profile_id = coach and role = 'owner' limit 1;

  -- Le notifiche le scrive lo script, una per evento importante, invece di una per riga inserita.
  alter table public.weekly_checkins disable trigger weekly_notify;
  alter table public.checkin_comments disable trigger checkin_comment_notify;
  alter table public.messages disable trigger messages_notify;

  -- ------------------------------------------------------------ Atleti finti
  -- weight/trend: peso iniziale e variazione al giorno; skip: quota di giorni senza check-in;
  -- factor: carichi rispetto alla scheda; last_weeks: settimane confermate (le più recenti possono mancare).
  for ath in select * from (values
    ('atleta@test.it',        'Nave Test',    array['training','nutrition','checkin'], 82.8, -0.04, 0.10, 1.00, 5, 'Lavora in ufficio, si allena la sera. Gomito destro da monitorare sui curl. Preferisce pranzi veloci.'),
    ('giulia.bassi@test.it',  'Giulia Bassi', array['training','checkin'],             61.6, -0.02, 0.08, 0.55, 5, 'Ex pallavolista. Obiettivo: forza sui fondamentali, mantenere il peso. Ginocchio sinistro operato nel 2022.'),
    ('marco.riva@test.it',    'Marco Riva',   array['training','nutrition','checkin'], 87.5,  0.03, 0.05, 1.15, 5, 'Fase di massa pulita fino a febbraio. Turni in ospedale: allenamenti spesso al mattino.'),
    ('sara.lodi@test.it',     'Sara Lodi',    array['training','checkin'],             58.2, -0.01, 0.15, 0.60, 4, 'Corre 2 volte a settimana oltre ai pesi. Allergia alla frutta a guscio.'),
    ('luca.ferri@test.it',    'Luca Ferri',   array['nutrition','checkin'],            96.4, -0.08, 0.40, 1.00, 2, 'Solo alimentazione. Intollerante al lattosio. Fa fatica con i check-in: sollecitare con gentilezza.')
  ) v(email, full_name, modules, weight, trend, skip, factor, last_weeks, note) loop
    select id into a from auth.users where email = ath.email;
    if a is null then
      a := md5('seed:user:' || ath.email)::uuid;
      -- Password casuale: questi account servono a popolare la console del coach, non per entrare.
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
        email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', ath.email,
        crypt(gen_random_uuid()::text, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', ath.full_name), now() - interval '60 days', now(), '', '', '', '', '', '', '', '');
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (a::text, a, jsonb_build_object('sub', a::text, 'email', ath.email, 'email_verified', true), 'email', now(), now(), now());
      insert into public.profiles (id, full_name) values (a, ath.full_name) on conflict (id) do nothing;
      update public.profiles set full_name = ath.full_name, role = 'athlete' where id = a;
    end if;

    if studio is not null then
      insert into public.studio_members (studio_id, profile_id, role) values (studio, a, 'member') on conflict do nothing;
    end if;
    insert into public.care_links (athlete_id, professional_id, studio_id, modules, started_at)
    values (a, coach, studio, ath.modules, now() - interval '60 days')
    on conflict (athlete_id, professional_id) do nothing;
    select id into link from public.care_links where athlete_id = a and professional_id = coach;

    insert into public.coach_notes (athlete_id, professional_id, body, updated_at)
    values (a, coach, ath.note, now() - interval '3 days') on conflict do nothing;

    -- Check-in: configurazione di partenza (come il modulo Google del coach), consegna la domenica.
    insert into public.checkin_settings (athlete_id, config, updated_by) values (a,
      '{"morning":["weight","sleep_hours","sleep_quality"],"evening":["steps","stress","fatigue","hunger"],"weekday":0,
        "weekly":[{"key":"weight","required":true,"locked":false},{"key":"sleep_hours","required":true,"locked":false},
        {"key":"sleep_quality","required":true,"locked":false},{"key":"steps","required":true,"locked":false},
        {"key":"workouts_done","required":true,"locked":false},{"key":"workouts_comment","required":false,"locked":false},
        {"key":"diet_adherence","required":true,"locked":false},{"key":"nutrition_notes","required":false,"locked":false},
        {"key":"stress","required":true,"locked":false},{"key":"fatigue","required":true,"locked":false},
        {"key":"hunger","required":true,"locked":false}]}'::jsonb, coach)
    on conflict (athlete_id) do nothing;

    -- Check-in giornalieri delle ultime 6 settimane (oggi solo il mattino).
    for i in 0..41 loop
      d := current_date - i;
      continue when i > 0 and random() < ath.skip;
      insert into public.daily_entries (athlete_id, day, moment, "values", status, updated_at) values (a, d, 'morning',
        jsonb_build_object(
          'weight', jsonb_build_object('v', round((ath.weight + ath.trend * (41 - i) + (random() - 0.5) * 0.8)::numeric, 1)),
          'sleep_hours', jsonb_build_object('v', round((6 + random() * 2.2) * 4) / 4),
          'sleep_quality', jsonb_build_object('v', 5 + floor(random() * 5)::int)),
        'done', d + time '07:40')
      on conflict (athlete_id, day, moment) do nothing;
      continue when i = 0;
      insert into public.daily_entries (athlete_id, day, moment, "values", status, updated_at) values (a, d, 'evening',
        jsonb_build_object(
          'steps', jsonb_build_object('v', (5500 + floor(random() * 6500))::int),
          'stress', jsonb_build_object('v', 2 + floor(random() * 6)::int),
          'fatigue', jsonb_build_object('v', 3 + floor(random() * 5)::int),
          'hunger', jsonb_build_object('v', 3 + floor(random() * 5)::int)),
        'done', d + time '22:15')
      on conflict (athlete_id, day, moment) do nothing;
    end loop;

    -- Scheda: copia di quella attiva di Nave Test, per gli altri atleti che si allenano.
    if 'training' = any (ath.modules) then
      select id into prog from public.programs where athlete_id = a and status = 'active' limit 1;
      if prog is null then
        select p.id into src_program from public.programs p join auth.users u on u.id = p.athlete_id
          where u.email = 'atleta@test.it' and p.status = 'active' limit 1;
        if src_program is not null then
          prog := md5('seed:program:' || a)::uuid;
          insert into public.programs (id, athlete_id, professional_id, name, notes, training_weekdays, status, starts_on, created_at)
          select prog, a, coach, 'Forza base · blocco 1', notes, training_weekdays, 'active', current_date - 35, now() - interval '36 days'
          from public.programs where id = src_program on conflict do nothing;
          insert into public.program_sessions (id, program_id, position, name, notes)
          select md5('seed:session:' || a || ps.id)::uuid, prog, ps.position, ps.name, ps.notes
          from public.program_sessions ps where ps.program_id = src_program on conflict (id) do nothing;
          insert into public.session_exercises (id, session_id, position, exercise_id, name, group_label, sets, reps, load, tempo, rir, rest_seconds, notes, film, bodyweight)
          select md5('seed:sx:' || a || se.id)::uuid, md5('seed:session:' || a || se.session_id)::uuid, se.position, null, se.name,
            se.group_label, se.sets, se.reps, se.load, se.tempo, se.rir, se.rest_seconds, se.notes, se.film, se.bodyweight
          from public.session_exercises se join public.program_sessions ps on ps.id = se.session_id
          where ps.program_id = src_program on conflict (id) do nothing;
        end if;
      end if;

      -- Sedute svolte nelle ultime 5 settimane, nei giorni della scheda, a rotazione.
      if prog is not null then
        n := 0;
        select training_weekdays into wdays from public.programs where id = prog;
        for i in reverse 35..1 loop
          d := current_date - i;
          continue when not extract(dow from d)::int = any (wdays);
          select * into sess from public.program_sessions where program_id = prog
            order by position offset (n % greatest((select count(*) from public.program_sessions where program_id = prog), 1)) limit 1;
          n := n + 1;
          exit when sess.id is null;
          wid := md5('seed:workout:' || a || d)::uuid;
          continue when exists (select 1 from public.workout_logs where athlete_id = a and performed_on = d);
          -- Una seduta saltata ogni tanto, con il motivo.
          if random() < ath.skip / 2 then
            insert into public.workout_logs (id, athlete_id, program_id, session_id, session_name, performed_on, status, notes, client_updated_at, synced_at)
            values (wid, a, prog, sess.id, sess.name, d, 'skipped', 'Turno al lavoro, recupero la prossima volta.', d + time '20:00', d + time '20:00')
            on conflict do nothing;
            continue;
          end if;
          insert into public.workout_logs (id, athlete_id, program_id, session_id, session_name, performed_on, status, notes, started_at, finished_at, client_updated_at, synced_at)
          values (wid, a, prog, sess.id, sess.name, d, 'done',
            case when random() < 0.3 then (array['Buone sensazioni, carichi saliti.', 'Poco sonno, ho tenuto i carichi.', 'Fastidio leggero al gomito sui curl.', 'Palestra piena, ho invertito due esercizi.'])[1 + floor(random() * 4)::int] else '' end,
            d + time '18:30', d + time '19:35', d + time '19:35', d + time '19:36')
          on conflict do nothing;
          for ex in select * from public.session_exercises where session_id = sess.id order by position loop
            base := coalesce(nullif(substring(ex.load from '([0-9]+(?:[.,][0-9]+)?)\s*kg'), '')::numeric,
              case when ex.name ilike 'croci%' then 15 when ex.name ilike 'push-down%' then 25 when ex.name ilike 'lat machine%' then 55
                   when ex.name ilike 'calf%' then 60 else 20 end);
            for k in 1..ex.sets loop
              insert into public.set_logs (id, workout_id, session_exercise_id, exercise_name, set_index, load, reps, note, done_at, client_updated_at)
              values (md5('seed:set:' || wid || ex.id || k)::uuid, wid, ex.id, ex.name, k - 1,
                case when ex.bodyweight then 0 else round(base * ath.factor * (0.92 + (35 - i) * 0.003) / 2.5) * 2.5 end,
                coalesce(nullif(substring(ex.reps from '^([0-9]+)'), '')::int, 8) + floor(random() * 3)::int - case when k = ex.sets then 1 else 0 end,
                case when ex.name ilike 'curl%' and k = ex.sets and random() < 0.3 then 'Fastidio al gomito, fermato prima' else '' end,
                d + time '18:30' + (ex.position * 12 + k * 3) * interval '1 minute', d + time '19:35')
              on conflict do nothing;
            end loop;
          end loop;
        end loop;
      end if;
    end if;

    -- Resoconti settimanali confermati (domenica), con i valori calcolati dai giornalieri.
    for k in 1..5 loop
      w_end := cur_end - 7 * k;
      -- Chi ha meno settimane confermate ha saltato le più recenti.
      continue when k <= 5 - ath.last_weeks;
      continue when exists (select 1 from public.weekly_checkins where athlete_id = a and week_end = w_end);
      select coalesce(jsonb_object_agg(key, jsonb_build_object('value', val, 'origin', 'computed', 'computed', val, 'count', c)), '{}')
        into snap
      from (
        select key, count(*) c,
          round(avg((e."values" -> key ->> 'v')::numeric), case key when 'steps' then 0 when 'sleep_hours' then 2 else 1 end) val
        from public.daily_entries e, unnest(array['weight','sleep_hours','sleep_quality','steps','stress','fatigue','hunger']) key
        where e.athlete_id = a and e.day between w_end - 6 and w_end and e."values" ? key
        group by key
      ) s;
      select count(*) into cnt from public.workout_logs where athlete_id = a and status = 'done' and performed_on between w_end - 6 and w_end;
      n := 6 + floor(random() * 4)::int;
      snap := snap || jsonb_build_object(
        'workouts_done', jsonb_build_object('value', cnt, 'origin', 'override', 'computed', null, 'count', 0),
        'diet_adherence', jsonb_build_object('value', n, 'origin', 'override', 'computed', null, 'count', 0));
      insert into public.weekly_checkins (id, athlete_id, week_end, overrides, answers, notes, snapshot, status, confirmed_at, updated_at)
      values (md5('seed:weekly:' || a || w_end)::uuid, a, w_end,
        jsonb_build_object('workouts_done', jsonb_build_object('v', cnt), 'diet_adherence', jsonb_build_object('v', n)),
        jsonb_build_object(
          'workouts_comment', (array['Sedute regolari, carichi in salita su panca.', 'Una seduta saltata per lavoro.', 'Bene, ma stanco a fine settimana.', 'Squat migliorato, più stabile in buca.'])[1 + floor(random() * 4)::int],
          'nutrition_notes', (array['Sabato cena fuori, pizza.', 'Tutto secondo piano.', 'Fatica con lo spuntino del pomeriggio.', 'Ho sostituito il tonno con il pollo due volte.'])[1 + floor(random() * 4)::int]),
        case when k = 1 then 'Settimana pesante al lavoro, ma ho tenuto il piano.' else '' end,
        snap, 'confirmed', (w_end + time '20:30'), (w_end + time '20:30'))
      on conflict do nothing;
    end loop;

    -- Chat: qualche scambio recente. L'ultimo messaggio dell'atleta resta da leggere per Giulia e Luca.
    insert into public.messages (id, care_link_id, sender_id, body, created_at, read_at)
    select md5('seed:msg:' || a || m.n)::uuid, link, case when m.from_coach then coach else a end, m.body,
      now() - m.ago, case when m.unread then null else now() - m.ago + interval '5 minutes' end
    from (values
      (1, true,  'Ciao! Ho visto il check-in di domenica, come va il recupero tra le sedute?', interval '6 days', false),
      (2, false, 'Bene, solo un po'' di indolenzimento il giorno dopo le gambe.', interval '6 days' - interval '2 hours', false),
      (3, true,  'Normale nelle prime settimane. Se dura più di due giorni scrivimi.', interval '6 days' - interval '3 hours', false),
      (4, false, case ath.full_name when 'Giulia Bassi' then 'Sul Romanian deadlift sento più la schiena che i femorali, è normale?'
                                    when 'Luca Ferri' then 'Questa settimana sono stato fuori per lavoro, posso mandare il check-in lunedì?'
                                    else 'Ok, grazie!' end, interval '20 hours', ath.full_name in ('Giulia Bassi', 'Luca Ferri'))
    ) m(n, from_coach, body, ago, unread)
    where link is not null and ath.email <> 'atleta@test.it'
    on conflict do nothing;
  end loop;

  -- ------------------------------------------------------------ Commenti sul check-in
  insert into public.checkin_comments (id, weekly_checkin_id, author_id, field_key, kind, body, created_at)
  select md5('seed:comment:' || w.id)::uuid, w.id, coach, 'weight', 'comment',
    'Peso in calo regolare, ottimo. Teniamo così anche la prossima settimana.', w.confirmed_at + interval '14 hours'
  from public.weekly_checkins w join auth.users u on u.id = w.athlete_id
  where u.email = 'atleta@test.it' and w.week_end = cur_end - 7
  on conflict do nothing;
  insert into public.checkin_comments (id, weekly_checkin_id, author_id, field_key, kind, body, created_at)
  select md5('seed:question:' || w.id)::uuid, w.id, coach, 'sleep_hours', 'question',
    'Dormi meno di 7 ore quasi ogni notte: riesci ad anticipare di mezz''ora?', w.confirmed_at + interval '15 hours'
  from public.weekly_checkins w join auth.users u on u.id = w.athlete_id
  where u.email = 'giulia.bassi@test.it' and w.week_end = cur_end - 7
  on conflict do nothing;

  -- ------------------------------------------------------------ Agenda del coach
  insert into public.coach_tasks (id, professional_id, athlete_id, title, due_on, done_at, created_at)
  select md5('seed:task:' || t.title)::uuid, coach, (select id from auth.users where email = t.email), t.title,
    current_date + t.due, case when t.done then now() - interval '1 day' end, now() - interval '5 days'
  from (values
    ('atleta@test.it', 'Rivedere il pranzo dei giorni di riposo', 1, false),
    ('giulia.bassi@test.it', 'Preparare la scheda del blocco 2', 3, false),
    ('luca.ferri@test.it', 'Sentire Luca per i check-in mancanti', -1, false),
    ('marco.riva@test.it', 'Aumentare le kcal di 150 nei giorni di allenamento', 5, false),
    ('sara.lodi@test.it', 'Controllare il video dello squat', -3, true)
  ) t(email, title, due, done)
  on conflict do nothing;

  -- ------------------------------------------------------------ Intolleranze e catalogo esercizi
  insert into public.athlete_diet_notes (athlete_id, lactose_intolerant, allergens, other, updated_by)
  select id, email = 'luca.ferri@test.it', case when email = 'sara.lodi@test.it' then array['frutta_a_guscio'] else '{}' end,
    null, coach from auth.users where email in ('luca.ferri@test.it', 'sara.lodi@test.it')
  on conflict do nothing;

  insert into public.exercises (id, owner_id, name, instructions, video_url, bodyweight)
  select md5('seed:exercise:' || e.name)::uuid, coach, e.name, e.instr, null, e.bw
  from (values
    ('Panca piana con bilanciere', 'Scapole addotte e depresse, piedi a terra. Bilanciere sullo sterno, gomiti a 45°.', false),
    ('Squat con bilanciere', 'Bilanciere sui trapezi, scendi sotto il parallelo mantenendo il busto stabile.', false),
    ('Stacco rumeno', 'Ginocchia leggermente flesse, spingi il bacino indietro e scendi finché senti i femorali.', false),
    ('Trazioni alla sbarra', 'Presa prona poco più larga delle spalle, petto verso la sbarra, scendi controllato.', true),
    ('Rematore con bilanciere', 'Busto a 45°, tira verso l''ombelico senza slanci.', false),
    ('Military press con manubri', 'Seduto, schiena appoggiata, spingi sopra la testa senza inarcare.', false),
    ('Lat machine presa stretta', 'Petto in fuori, tira verso lo sterno, gomiti vicini al corpo.', false),
    ('Affondi camminati', 'Passo lungo, ginocchio posteriore vicino a terra, busto dritto.', false),
    ('Curl con manubri', 'Gomiti fermi ai fianchi, sali in 1 secondo e scendi in 3.', false),
    ('Plank', 'Corpo in linea, glutei contratti, respira normalmente.', true)
  ) e(name, instr, bw)
  on conflict do nothing;

  -- Un invito ancora da accettare.
  insert into public.invites (id, email, full_name, invited_by, studio_id, modules, expires_at, created_at)
  values (md5('seed:invite:elena')::uuid, 'elena.conti@test.it', 'Elena Conti', coach, studio,
    array['training', 'checkin'], now() + interval '5 days', now() - interval '2 days')
  on conflict do nothing;

  -- ------------------------------------------------------------ Notifiche principali
  insert into public.notifications (recipient_id, kind, title, body, link, created_at)
  select coach, n.kind, n.title, n.body, y.link, now() - n.ago
  from (values
    ('message', 'Giulia Bassi', 'Sul Romanian deadlift sento più la schiena che i femorali, è normale?', 'giulia.bassi@test.it', interval '20 hours'),
    ('message', 'Luca Ferri', 'Questa settimana sono stato fuori per lavoro, posso mandare il check-in lunedì?', 'luca.ferri@test.it', interval '20 hours'),
    ('weekly_confirmed', 'Marco Riva ha inviato il check-in settimanale', '', 'marco.riva@test.it', interval '6 days')
  ) n(kind, title, body, email, ago)
  cross join lateral (select l.id lid, l.athlete_id aid from public.care_links l join auth.users u on u.id = l.athlete_id
    where u.email = n.email and l.professional_id = coach) x
  cross join lateral (select case n.kind when 'message' then '/messaggi/' || x.lid else '/atleti/' || x.aid end link) y
  where not exists (select 1 from public.notifications o where o.recipient_id = coach and o.title = n.title and o.link = y.link);

  insert into public.notifications (recipient_id, kind, title, body, link, created_at)
  select u.id, 'checkin_comment', 'Rugge (test) ha commentato il tuo check-in',
    'Peso in calo regolare, ottimo. Teniamo così anche la prossima settimana.', '/settimanale?settimana=' || (cur_end - 7), now() - interval '5 days'
  from auth.users u where u.email = 'atleta@test.it'
    and not exists (select 1 from public.notifications o where o.recipient_id = u.id and o.kind = 'checkin_comment');

  alter table public.weekly_checkins enable trigger weekly_notify;
  alter table public.checkin_comments enable trigger checkin_comment_notify;
  alter table public.messages enable trigger messages_notify;
end
$seed$;
