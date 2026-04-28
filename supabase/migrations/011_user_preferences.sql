-- Preferences per auth user (independent of player records)
create table user_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  default_course_id uuid references courses(id) on delete set null
);

alter table user_preferences enable row level security;

create policy "user_preferences all" on user_preferences
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
