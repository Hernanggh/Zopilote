-- v2.0 Fase 1: tabla contacts + backfill + contact_id en round_players

-- ─── 1. Tabla contacts ────────────────────────────────────────────────────────
create table contacts (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  player_id       uuid references players(id) on delete set null,
  display_name    text not null,
  suffix          text,
  handicap        int  not null default 0 check (handicap >= 0),
  email           text,
  created_at      timestamptz default now(),
  unique (owner_user_id, player_id)
);

alter table contacts enable row level security;
create policy "contacts select" on contacts for select using (owner_user_id = auth.uid());
create policy "contacts insert" on contacts for insert with check (owner_user_id = auth.uid());
create policy "contacts update" on contacts for update using (owner_user_id = auth.uid());
create policy "contacts delete" on contacts for delete using (owner_user_id = auth.uid());

-- ─── 2. contact_id en round_players (nullable para datos históricos) ──────────
alter table round_players add column if not exists contact_id uuid references contacts(id) on delete set null;

-- ─── 3. display_name_snapshot en round_players (fallback para partidas sin contact_id) ──
alter table round_players add column if not exists display_name_snapshot text;

-- ─── 4. Backfill contacts desde players.created_by ───────────────────────────
insert into contacts (owner_user_id, player_id, display_name, suffix, handicap, email)
select
  p.created_by,
  p.id,
  p.name,
  p.suffix,
  p.default_handicap,
  p.email
from players p
where p.created_by is not null
on conflict (owner_user_id, player_id) do nothing;

-- ─── 5. Backfill contacts desde players.user_id (jugadores con cuenta propia) ─
insert into contacts (owner_user_id, player_id, display_name, suffix, handicap, email)
select
  p.user_id,
  p.id,
  p.name,
  p.suffix,
  p.default_handicap,
  p.email
from players p
where p.user_id is not null
on conflict (owner_user_id, player_id) do nothing;

-- ─── 6. Backfill contact_id en round_players ─────────────────────────────────
update round_players rp
set contact_id = c.id
from rounds r, contacts c
where rp.round_id = r.id
  and c.owner_user_id = r.created_by
  and c.player_id = rp.player_id
  and rp.contact_id is null;

-- ─── 7. Backfill display_name_snapshot en round_players ──────────────────────
update round_players rp
set display_name_snapshot = p.name || coalesce(' ' || p.suffix, '')
from players p
where rp.player_id = p.id
  and rp.display_name_snapshot is null;

-- ─── 8. Restringir UPDATE en players: solo el creador o el propio usuario ─────
drop policy if exists "players update" on players;
create policy "players update" on players for update using (
  created_by = auth.uid() or user_id = auth.uid()
);
