-- Fix: players created by a user should be visible to that user
alter table players add column if not exists created_by uuid references auth.users(id);

drop policy if exists "players read" on players;
create policy "players read" on players for select using (
  created_by = auth.uid()
  or exists (
    select 1 from round_players rp
    join rounds r on r.id = rp.round_id
    where rp.player_id = players.id
    and r.created_by = auth.uid()
  )
  or is_round_participant_player(players.id)
  or players.user_id = auth.uid()
);
