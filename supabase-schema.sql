-- =============================================================================
-- PARKINGPAL SUPABASE SETUP
-- =============================================================================
-- You must run this script in Supabase so parking and permits sync across devices.
--
-- Steps:
-- 1. Open your project at https://supabase.com/dashboard
-- 2. Go to SQL Editor → New query
-- 3. Paste this entire file and click Run
-- 4. Confirm both tables appear under Table Editor: current_parking, user_permits
-- =============================================================================

-- Current parking (location + timer) per user
create table if not exists public.current_parking (
  user_id uuid primary key references auth.users (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  "timestamp" bigint not null,
  timer jsonb,
  updated_at timestamptz not null default now()
);

alter table public.current_parking enable row level security;

drop policy if exists "Users can read own current_parking" on public.current_parking;
drop policy if exists "Users can insert own current_parking" on public.current_parking;
drop policy if exists "Users can update own current_parking" on public.current_parking;
drop policy if exists "Users can delete own current_parking" on public.current_parking;

create policy "Users can read own current_parking"
  on public.current_parking for select
  using (auth.uid() = user_id);

create policy "Users can insert own current_parking"
  on public.current_parking for insert
  with check (auth.uid() = user_id);

create policy "Users can update own current_parking"
  on public.current_parking for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own current_parking"
  on public.current_parking for delete
  using (auth.uid() = user_id);

-- User parking permits (up to 3), synced across devices when signed in
create table if not exists public.user_permits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  permits jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table public.user_permits enable row level security;

drop policy if exists "Users can read own user_permits" on public.user_permits;
drop policy if exists "Users can insert own user_permits" on public.user_permits;
drop policy if exists "Users can update own user_permits" on public.user_permits;
drop policy if exists "Users can delete own user_permits" on public.user_permits;

create policy "Users can read own user_permits"
  on public.user_permits for select
  using (auth.uid() = user_id);

create policy "Users can insert own user_permits"
  on public.user_permits for insert
  with check (auth.uid() = user_id);

create policy "Users can update own user_permits"
  on public.user_permits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own user_permits"
  on public.user_permits for delete
  using (auth.uid() = user_id);
