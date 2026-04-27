-- Allow round creator to update game configs and player handicaps mid-round

create policy "round_game_config update" on round_game_config
  for update using (
    exists (select 1 from rounds r where r.id = round_game_config.round_id and r.created_by = auth.uid())
  );

create policy "round_players update" on round_players
  for update using (
    exists (select 1 from rounds r where r.id = round_players.round_id and r.created_by = auth.uid())
  );
