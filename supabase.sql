-- Ejecutar una vez en Supabase > SQL Editor
create table if not exists public.medicamentos (
  id text primary key,
  generic_name text not null,
  brand_name text not null default '',
  pharmacological_group text not null default '',
  presentation text not null default '',
  mechanism text not null default '',
  indications text not null default '',
  adult_dose text not null default '',
  pediatric_dose text not null default '',
  nursing_care text not null default '',
  side_effects text not null default '',
  adverse_reactions text not null default '',
  photo text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.medicamentos enable row level security;

-- Acceso abierto con la clave publicable (sin inicio de sesión).
-- Para restringir la edición, reemplaza estas políticas por otras con auth.
create policy "leer medicamentos" on public.medicamentos for select using (true);
create policy "agregar medicamentos" on public.medicamentos for insert with check (true);
create policy "editar medicamentos" on public.medicamentos for update using (true) with check (true);
create policy "eliminar medicamentos" on public.medicamentos for delete using (true);
