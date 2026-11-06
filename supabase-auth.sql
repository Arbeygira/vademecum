-- Ejecutar en Supabase > SQL Editor: solo usuarios con sesión pueden modificar
drop policy if exists "agregar medicamentos" on public.medicamentos;
drop policy if exists "editar medicamentos" on public.medicamentos;
drop policy if exists "eliminar medicamentos" on public.medicamentos;

create policy "agregar medicamentos" on public.medicamentos for insert to authenticated with check (true);
create policy "editar medicamentos" on public.medicamentos for update to authenticated using (true) with check (true);
create policy "eliminar medicamentos" on public.medicamentos for delete to authenticated using (true);
