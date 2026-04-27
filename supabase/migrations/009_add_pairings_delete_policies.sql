-- Allow round creator to delete and re-insert pairings from setup modal

create policy "round_pairings delete" on round_pairings
  for delete using (
    exists (select 1 from rounds r where r.id = round_pairings.round_id and r.created_by = auth.uid())
  );

create policy "round_base_pair delete" on round_base_pair
  for delete using (
    exists (select 1 from rounds r where r.id = round_base_pair.round_id and r.created_by = auth.uid())
  );
