-- Vincula retroactivamente el user_id de un jugador cuando el usuario ya tenía cuenta
-- antes de que el organizador agregara su email al perfil en players.
-- El trigger link_player_on_signup solo cubre el caso de cuenta nueva; esta función
-- cubre el caso inverso (cuenta existente, perfil creado después).

create or replace function public.link_player_for_current_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update players
  set user_id = auth.uid()
  where lower(email) = (
    select lower(email) from auth.users where id = auth.uid()
  )
  and user_id is null;
end;
$$;
