-- Catalogo alimentare: foto delle etichette in un bucket privato.
-- Percorso: food-labels/{user_id}/{nome}.jpg. Ogni utente carica solo nella propria cartella; tutti gli utenti
-- collegati possono vedere le foto (sono etichette di prodotti, non dati personali), così il master le controlla.
-- Le foto non si modificano né si cancellano: sono la prova dei valori di una versione.
-- Una versione "da etichetta" deve indicare una foto esistente caricata da chi la registra (o dal master).

insert into storage.buckets (id, name, public) values ('food-labels', 'food-labels', false)
on conflict (id) do nothing;

create policy food_labels_read on storage.objects for select to authenticated
  using (bucket_id = 'food-labels');
create policy food_labels_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'food-labels' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.insert_food_version(fid uuid, ver int, vals jsonb, prov text, unread text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  vid uuid;
  photo text := nullif(trim(vals->>'label_photo_path'), '');
begin
  if prov = 'label' and photo is null then raise exception 'label_photo_required'; end if;
  if photo is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'food-labels' and o.name = photo and (o.owner = auth.uid() or public.is_master())
  ) then
    raise exception 'label_photo_not_found';
  end if;

  insert into food_versions (food_id, version, kcal, kj, protein_g, carbs_g, sugars_g, fat_g, sat_fat_g, fiber_g,
                             polyols_g, salt_g, sodium_mg, ingredients, allergens, provenance, label_photo_path,
                             unreadable, is_estimate, estimate_note, note, created_by)
  values (fid, ver, (vals->>'kcal')::numeric, (vals->>'kj')::numeric, (vals->>'protein_g')::numeric,
          (vals->>'carbs_g')::numeric, (vals->>'sugars_g')::numeric, (vals->>'fat_g')::numeric,
          (vals->>'sat_fat_g')::numeric, (vals->>'fiber_g')::numeric, (vals->>'polyols_g')::numeric,
          (vals->>'salt_g')::numeric, (vals->>'sodium_mg')::numeric, vals->>'ingredients',
          coalesce(array(select jsonb_array_elements_text(vals->'allergens')), '{}'),
          prov, photo, unread,
          coalesce((vals->>'is_estimate')::boolean, false), vals->>'estimate_note', vals->>'note', auth.uid())
  returning id into vid;
  return vid;
end $$;
revoke execute on function public.insert_food_version(uuid, int, jsonb, text, text[]) from public, anon, authenticated;
