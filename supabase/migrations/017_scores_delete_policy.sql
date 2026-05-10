-- Permite a los organizadores borrar scores (necesario para limpiar celdas)
create policy "scores delete" on scores for delete using (
  is_round_organizer(scores.round_id)
);
