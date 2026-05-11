-- Foursome favoritos por usuario (is_favorite per-user)
create table player_favorites (
  user_id   uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references players(id)    on delete cascade,
  primary key (user_id, player_id)
);
alter table player_favorites enable row level security;

create policy "player_favorites select" on player_favorites for select using (user_id = auth.uid());
create policy "player_favorites insert" on player_favorites for insert with check (user_id = auth.uid());
create policy "player_favorites delete" on player_favorites for delete using (user_id = auth.uid());
