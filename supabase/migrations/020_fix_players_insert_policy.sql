-- Fix: recreate players insert policy to ensure it exists in Supabase
drop policy if exists "players insert" on players;
create policy "players insert" on players for insert with check (auth.uid() is not null);
