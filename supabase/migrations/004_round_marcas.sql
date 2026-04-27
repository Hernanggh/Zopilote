-- Tabla para marcas especiales (birdie, o'yes, hole-out, etc.) — entrada manual por hoyo/jugador

create table public.round_marcas (
  id          uuid default gen_random_uuid() primary key,
  round_id    uuid references public.rounds(id) on delete cascade not null,
  player_id   uuid references public.players(id) not null,
  hole_number int not null check (hole_number between 1 and 18),
  nota        text not null,
  unique(round_id, player_id, hole_number)
);

alter table public.round_marcas enable row level security;

create policy "round_marcas select" on round_marcas for select using (
  exists (select 1 from rounds r where r.id = round_marcas.round_id and r.created_by = auth.uid())
  or is_round_participant(round_id)
);

create policy "round_marcas insert" on round_marcas for insert with check (
  exists (select 1 from rounds r where r.id = round_marcas.round_id and r.created_by = auth.uid())
  or is_round_participant(round_id)
);

create policy "round_marcas update" on round_marcas for update using (
  exists (select 1 from rounds r where r.id = round_marcas.round_id and r.created_by = auth.uid())
  or is_round_participant(round_id)
);

create policy "round_marcas delete" on round_marcas for delete using (
  exists (select 1 from rounds r where r.id = round_marcas.round_id and r.created_by = auth.uid())
  or is_round_participant(round_id)
);
