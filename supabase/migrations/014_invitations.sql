-- Fase 3: links de invitación con expiración

create table round_invitations (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid references rounds(id) on delete cascade not null,
  token      text unique not null default encode(gen_random_bytes(12), 'hex'),
  created_by uuid references auth.users(id) not null,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz default now()
);

alter table round_invitations enable row level security;

-- Cualquier usuario autenticado puede leer por token (validar invitación)
create policy "invitations read" on round_invitations
  for select using (auth.role() = 'authenticated');

-- Solo el creador puede insertar
create policy "invitations insert" on round_invitations
  for insert with check (created_by = auth.uid());
