-- Multi-usuario Fase 1: vinculación por email + vista espectador

-- ─── 1. Email en players ─────────────────────────────────────────────────────
alter table players add column if not exists email text;
create index if not exists players_email_idx on players(lower(email));

-- ─── 2. Trigger de auto-linking al registrarse ───────────────────────────────
create or replace function public.link_player_on_signup()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  update players set user_id = new.id
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_player_on_signup();

-- ─── 3. Fix RLS scores — solo el creador de la ronda puede escribir ──────────
drop policy if exists "scores insert" on scores;
drop policy if exists "scores update" on scores;

create policy "scores insert" on scores
  for insert with check (
    exists (select 1 from rounds where id = scores.round_id and created_by = auth.uid())
  );

create policy "scores update" on scores
  for update using (
    exists (select 1 from rounds where id = scores.round_id and created_by = auth.uid())
  );

-- ─── 4. Fix RLS players — SELECT limitado a jugadores de tus partidas ────────
drop policy if exists "players read" on players;

create policy "players read" on players for select using (
  -- tus propios jugadores (los que creaste)
  exists (
    select 1 from round_players rp
    join rounds r on r.id = rp.round_id
    where rp.player_id = players.id
    and r.created_by = auth.uid()
  )
  or
  -- jugadores de partidas donde eres participante
  is_round_participant_player(players.id)
  or
  -- tu propio perfil vinculado
  players.user_id = auth.uid()
);

-- Helper: verifica si el usuario actual es participante en alguna ronda
-- que contenga al jugador dado (sin causar recursión)
create or replace function public.is_round_participant_player(p_player_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from round_players rp1
    join round_players rp2 on rp2.round_id = rp1.round_id
    join players p on p.id = rp1.player_id
    where rp2.player_id = p_player_id
    and p.user_id = auth.uid()
  );
$$;
