-- Columna oficial en rounds (default true — todas las partidas cuentan por defecto)
alter table rounds add column if not exists official boolean not null default true;

-- Resultados finales por jugador por partida (para ranking de temporada)
create table round_player_results (
  round_id         uuid    not null references rounds(id)  on delete cascade,
  player_id        uuid    not null references players(id) on delete cascade,
  balance          numeric not null default 0,
  marcas           numeric not null default 0,
  marcas_esp       numeric not null default 0,
  individuales     numeric not null default 0,
  ind_medal        numeric not null default 0,
  parejas          numeric not null default 0,
  parejas_medal    numeric not null default 0,
  parejas_base     numeric not null default 0,
  pb_medal         numeric not null default 0,
  presiones        numeric not null default 0,
  primary key (round_id, player_id)
);
alter table round_player_results enable row level security;

create policy "round_player_results select" on round_player_results for select using (true);
create policy "round_player_results insert" on round_player_results for insert
  with check (is_round_organizer(round_id));
create policy "round_player_results update" on round_player_results for update
  using (is_round_organizer(round_id));
