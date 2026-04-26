-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── Courses ────────────────────────────────────────────────────────────────
create table courses (
  id   uuid primary key default uuid_generate_v4(),
  name text not null unique
);

create table course_holes (
  id            uuid primary key default uuid_generate_v4(),
  course_id     uuid not null references courses(id) on delete cascade,
  hole_number   int  not null check (hole_number between 1 and 18),
  par           int  not null check (par between 3 and 5),
  handicap_rank int  not null check (handicap_rank between 1 and 18),
  unique (course_id, hole_number)
);

-- ─── Players ─────────────────────────────────────────────────────────────────
create table players (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid references auth.users(id) on delete set null,
  name             text not null,
  default_handicap int  not null default 0 check (default_handicap >= 0)
);

-- ─── Rounds ──────────────────────────────────────────────────────────────────
create table rounds (
  id          uuid primary key default uuid_generate_v4(),
  course_id   uuid not null references courses(id),
  start_hole  int  not null default 1 check (start_hole in (1, 10)),
  date        date not null default current_date,
  created_by  uuid not null references auth.users(id),
  status      text not null default 'active' check (status in ('setup', 'active', 'finished')),
  created_at  timestamptz not null default now()
);

create table round_players (
  id        uuid primary key default uuid_generate_v4(),
  round_id  uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id),
  handicap  int  not null check (handicap >= 0),
  position  int  not null check (position between 1 and 6),
  unique (round_id, player_id),
  unique (round_id, position)
);

create table round_game_config (
  id         uuid primary key default uuid_generate_v4(),
  round_id   uuid    not null references rounds(id) on delete cascade,
  game_type  text    not null check (game_type in ('marcas', 'individuales', 'parejas', 'parejas_base', 'presiones')),
  active     boolean not null default false,
  bet_amount numeric not null default 0,
  unique (round_id, game_type)
);

create table round_pairings (
  id          uuid primary key default uuid_generate_v4(),
  round_id    uuid not null references rounds(id) on delete cascade,
  pair_number int  not null check (pair_number between 1 and 3),
  player1_id  uuid not null references players(id),
  player2_id  uuid not null references players(id),
  unique (round_id, pair_number)
);

create table round_base_pair (
  id         uuid primary key default uuid_generate_v4(),
  round_id   uuid not null references rounds(id) on delete cascade unique,
  player1_id uuid not null references players(id),
  player2_id uuid not null references players(id)
);

-- ─── Scores ──────────────────────────────────────────────────────────────────
create table scores (
  id          uuid primary key default uuid_generate_v4(),
  round_id    uuid not null references rounds(id) on delete cascade,
  player_id   uuid not null references players(id),
  hole_number int  not null check (hole_number between 1 and 18),
  gross_score int  not null check (gross_score >= 1),
  updated_at  timestamptz not null default now(),
  unique (round_id, player_id, hole_number)
);

-- Trigger to update updated_at on scores
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger scores_updated_at before update on scores
  for each row execute procedure update_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table courses       enable row level security;
alter table course_holes  enable row level security;
alter table players       enable row level security;
alter table rounds        enable row level security;
alter table round_players enable row level security;
alter table round_game_config enable row level security;
alter table round_pairings    enable row level security;
alter table round_base_pair   enable row level security;
alter table scores        enable row level security;

-- Public read for courses & holes (catalog data)
create policy "courses read" on courses       for select using (true);
create policy "holes read"   on course_holes  for select using (true);

-- Players: anyone can read; owner can insert/update own
create policy "players read"   on players for select using (true);
create policy "players insert" on players for insert with check (auth.uid() is not null);
create policy "players update" on players for update using (true);

-- Rounds: creator can do everything; round members can read
create policy "rounds insert" on rounds for insert with check (auth.uid() = created_by);
create policy "rounds select" on rounds for select using (
  created_by = auth.uid() or
  exists (select 1 from round_players rp
          join players pl on pl.id = rp.player_id
          where rp.round_id = rounds.id and pl.user_id = auth.uid())
);
create policy "rounds update" on rounds for update using (created_by = auth.uid());

-- Round sub-tables: same access as parent round
create policy "round_players select" on round_players for select using (
  exists (select 1 from rounds r where r.id = round_players.round_id and (
    r.created_by = auth.uid() or
    exists (select 1 from round_players rp2 join players pl on pl.id = rp2.player_id
            where rp2.round_id = r.id and pl.user_id = auth.uid())
  ))
);
create policy "round_players insert" on round_players for insert with check (
  exists (select 1 from rounds r where r.id = round_players.round_id and r.created_by = auth.uid())
);

create policy "round_game_config select" on round_game_config for select using (true);
create policy "round_game_config insert" on round_game_config for insert with check (
  exists (select 1 from rounds r where r.id = round_game_config.round_id and r.created_by = auth.uid())
);
create policy "round_pairings select" on round_pairings for select using (true);
create policy "round_pairings insert" on round_pairings for insert with check (true);
create policy "round_base_pair select" on round_base_pair for select using (true);
create policy "round_base_pair insert" on round_base_pair for insert with check (true);

-- Scores: round members can insert/update their own; all members can read
create policy "scores select" on scores for select using (true);
create policy "scores insert" on scores for insert with check (auth.uid() is not null);
create policy "scores update" on scores for update using (auth.uid() is not null);

-- ─── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table scores;
