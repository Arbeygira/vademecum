-- Ejecutar en Supabase > SQL Editor: solo usuarios con sesión pueden modificar
alter table public.medicamentos
  add column if not exists visible boolean not null default true;

drop policy if exists "leer medicamentos" on public.medicamentos;
drop policy if exists "agregar medicamentos" on public.medicamentos;
drop policy if exists "editar medicamentos" on public.medicamentos;
drop policy if exists "eliminar medicamentos" on public.medicamentos;

create policy "leer medicamentos" on public.medicamentos for select to anon, authenticated
  using (visible or (select auth.uid()) is not null);
create policy "agregar medicamentos" on public.medicamentos for insert to authenticated with check (true);
create policy "editar medicamentos" on public.medicamentos for update to authenticated using (true) with check (true);
create policy "eliminar medicamentos" on public.medicamentos for delete to authenticated using (true);
