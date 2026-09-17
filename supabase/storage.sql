-- Bucket de Storage para las fotos de cierre de mantención.
-- Corre esto en el SQL Editor de Supabase, después de policies.sql.

insert into storage.buckets (id, name, public)
values ('maintenance-photos', 'maintenance-photos', true)
on conflict (id) do nothing;

-- Lectura pública (para poder mostrar <img src> sin firmar URLs).
drop policy if exists maintenance_photos_read on storage.objects;
create policy maintenance_photos_read on storage.objects for select
  using (bucket_id = 'maintenance-photos');

-- Solo usuarios autenticados pueden subir/actualizar dentro del bucket.
drop policy if exists maintenance_photos_write on storage.objects;
create policy maintenance_photos_write on storage.objects for insert
  with check (bucket_id = 'maintenance-photos' and auth.role() = 'authenticated');

drop policy if exists maintenance_photos_update on storage.objects;
create policy maintenance_photos_update on storage.objects for update
  using (bucket_id = 'maintenance-photos' and auth.role() = 'authenticated');
