-- Co-organizadores: permite que el creador delegue permisos de escritura a otros jugadores

-- ─── 1. Tabla ────────────────────────────────────────────────────────────────

create table round_organizers (
  round_id   uuid not null references rounds(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  primary key (round_id, user_id)
);
alter table round_organizers enable row level security;

-- ─── 2. Migrar datos — el creador original siempre es organizador ─────────────

insert into round_organizers (round_id, user_id)
select id, created_by from rounds;

-- ─── 3. Función helper ───────────────────────────────────────────────────────

create or replace function public.is_round_organizer(r_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from round_organizers where round_id = r_id and user_id = auth.uid()
  );
$$;

-- ─── 4. RLS en round_organizers ─────────────────────────────────────────────

create policy "round_organizers select" on round_organizers for select using (
  is_round_organizer(round_id) or is_round_participant(round_id)
);
create policy "round_organizers insert" on round_organizers for insert with check (
  exists (select 1 from rounds where id = round_id and created_by = auth.uid())
);
create policy "round_organizers delete" on round_organizers for delete using (
  exists (select 1 from rounds where id = round_id and created_by = auth.uid())
);

-- ─── 5. Actualizar policies existentes ──────────────────────────────────────

-- rounds
drop policy if exists "rounds update" on rounds;
create policy "rounds update" on rounds for update using (is_round_organizer(id));

drop policy if exists "rounds delete" on rounds;
create policy "rounds delete" on rounds for delete using (created_by = auth.uid());

-- round_players
drop policy if exists "round_players insert" on round_players;
create policy "round_players insert" on round_players for insert with check (
  is_round_organizer(round_players.round_id)
);

drop policy if exists "round_players update" on round_players;
create policy "round_players update" on round_players for update using (
  is_round_organizer(round_players.round_id)
);

-- round_game_config
drop policy if exists "round_game_config insert" on round_game_config;
create policy "round_game_config insert" on round_game_config for insert with check (
  is_round_organizer(round_game_config.round_id)
);

drop policy if exists "round_game_config update" on round_game_config;
create policy "round_game_config update" on round_game_config for update using (
  is_round_organizer(round_game_config.round_id)
);

-- round_pairings
drop policy if exists "round_pairings delete" on round_pairings;
create policy "round_pairings delete" on round_pairings for delete using (
  is_round_organizer(round_pairings.round_id)
);

-- round_base_pair
drop policy if exists "round_base_pair delete" on round_base_pair;
create policy "round_base_pair delete" on round_base_pair for delete using (
  is_round_organizer(round_base_pair.round_id)
);

-- scores
drop policy if exists "scores insert" on scores;
create policy "scores insert" on scores for insert with check (
  is_round_organizer(scores.round_id)
);

drop policy if exists "scores update" on scores;
create policy "scores update" on scores for update using (
  is_round_organizer(scores.round_id)
);

-- round_marcas
drop policy if exists "round_marcas insert" on round_marcas;
create policy "round_marcas insert" on round_marcas for insert with check (
  is_round_organizer(round_marcas.round_id) or is_round_participant(round_marcas.round_id)
);

drop policy if exists "round_marcas update" on round_marcas;
create policy "round_marcas update" on round_marcas for update using (
  is_round_organizer(round_marcas.round_id) or is_round_participant(round_marcas.round_id)
);

drop policy if exists "round_marcas delete" on round_marcas;
create policy "round_marcas delete" on round_marcas for delete using (
  is_round_organizer(round_marcas.round_id) or is_round_participant(round_marcas.round_id)
);
