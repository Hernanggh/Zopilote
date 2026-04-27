-- Permite al creador de una partida borrarla (y en cascade sus hijos)
create policy "rounds delete" on rounds for delete using (created_by = auth.uid());
