create or replace function get_birdie_counts(p_year int)
returns table(player_id uuid, birdies bigint) as $$
  select s.player_id, count(*) as birdies
  from scores s
  join rounds r on r.id = s.round_id
  join course_holes ch on ch.course_id = r.course_id and ch.hole_number = s.hole_number
  where r.official = true
    and extract(year from r.date) = p_year
    and s.gross_score > 0
    and s.gross_score <= ch.par - 1
  group by s.player_id
$$ language sql security definer;
