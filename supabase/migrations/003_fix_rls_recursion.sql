-- Fix: infinite recursion between rounds.select and round_players.select
--
-- Root cause:
--   round_players select → queries rounds (triggers rounds select policy)
--   rounds select        → queries round_players (triggers round_players select policy)
--   → infinite loop
--
-- Fix: SECURITY DEFINER function queries round_players bypassing RLS,
-- so neither policy needs to reference the other table through a policy.

create or replace function public.is_round_participant(p_round_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from round_players rp
    join players p on p.id = rp.player_id
    where rp.round_id = p_round_id
    and p.user_id = auth.uid()
  );
$$;

-- Rebuild the two policies that caused the cycle

drop policy if exists "rounds select"        on rounds;
drop policy if exists "round_players select" on round_players;

-- rounds: creator OR participant (participant check via SECURITY DEFINER — no RLS on inner query)
create policy "rounds select" on rounds for select using (
  created_by = auth.uid()
  or is_round_participant(id)
);

-- round_players: creator of the round OR participant (same function, safe)
create policy "round_players select" on round_players for select using (
  exists (select 1 from rounds r
          where r.id = round_players.round_id
          and r.created_by = auth.uid())
  or is_round_participant(round_id)
);
