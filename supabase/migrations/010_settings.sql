-- User game defaults: pre-fills new round creation
create table user_game_defaults (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  game_type  text not null check (game_type in (
    'marcas', 'marcas_esp', 'individuales', 'individuales_medal',
    'parejas', 'parejas_medal', 'parejas_base', 'parejas_base_medal', 'presiones'
  )),
  active     boolean not null default false,
  bet_amount numeric not null default 0,
  unique(user_id, game_type)
);

alter table user_game_defaults enable row level security;

create policy "user_game_defaults all" on user_game_defaults
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Default course per player
alter table players add column default_course_id uuid references courses(id) on delete set null;

-- Allow authenticated users to manage courses and holes
create policy "courses insert" on courses for insert with check (auth.uid() is not null);
create policy "courses update" on courses for update using (auth.uid() is not null);
create policy "course_holes insert_auth" on course_holes for insert with check (auth.uid() is not null);
create policy "course_holes update" on course_holes for update using (auth.uid() is not null);
