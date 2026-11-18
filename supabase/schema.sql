-- Escondite Urbano (v0.1) - Esquema Supabase Postgres + Realtime + RLS
-- Ejecutar en el SQL Editor de tu proyecto gratuito de Supabase.

-- 1. Tabla de salas
create table if not exists public.rooms (
  id uuid primary key,
  code text unique not null check (char_length(code) between 4 and 6),
  host_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  rules jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rooms_code_status on public.rooms (code, status);

-- 2. Tabla de jugadores
create table if not exists public.players (
  id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 12),
  emoji text not null,
  color text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now()
);

create index if not exists idx_players_room_id on public.players (room_id, joined_at);

-- 3. Seguridad (RLS) para acceso anónimo controlado en fase lobby
alter table public.rooms enable row level security;
alter table public.players enable row level security;

-- Lectura de salas abiertas en lobby
create policy "Permitir leer salas en lobby"
  on public.rooms for select
  using (status = 'lobby');

-- Creación de salas
create policy "Permitir crear salas"
  on public.rooms for insert
  with check (status = 'lobby');

-- Actualización de reglas mientras la sala está en lobby
create policy "Permitir actualizar salas en lobby"
  on public.rooms for update
  using (status = 'lobby')
  with check (status = 'lobby');

-- Permitir cerrar/borrar sala en lobby
create policy "Permitir borrar salas en lobby"
  on public.rooms for delete
  using (status = 'lobby');

-- Lectura de jugadores en salas activas
create policy "Permitir leer jugadores"
  on public.players for select
  using (
    exists (
      select 1 from public.rooms r
      where r.id = room_id and r.status = 'lobby'
    )
  );

-- Permitir unirse a una sala en lobby
create policy "Permitir insertar jugador en lobby"
  on public.players for insert
  with check (
    exists (
      select 1 from public.rooms r
      where r.id = room_id and r.status = 'lobby'
    )
  );

-- Permitir actualizar perfil en lobby
create policy "Permitir actualizar jugador en lobby"
  on public.players for update
  using (
    exists (
      select 1 from public.rooms r
      where r.id = room_id and r.status = 'lobby'
    )
  );

-- Permitir salir de la sala
create policy "Permitir borrar jugador en lobby"
  on public.players for delete
  using (true);

-- 4. Habilitar Supabase Realtime en ambas tablas
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.players;

-- 5. Función de limpieza de salas antiguas (> 6 horas sin actividad)
create or replace function public.cleanup_old_rooms()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.rooms
  where created_at < now() - interval '6 hours';
end;
$$;
