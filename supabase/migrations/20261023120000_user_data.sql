-- habeet: one row of data per signed-in user, locked to its owner.

create table public.user_data (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  rev        integer not null default 1,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  constraint user_data_size check (octet_length(data::text) <= 2000000)
);

alter table public.user_data enable row level security;

create policy "read own data" on public.user_data
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own data" on public.user_data
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own data" on public.user_data
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own data" on public.user_data
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.user_data from anon;

-- Lets a signed-in user delete their own account (their data goes with it).
create function public.delete_me()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke execute on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;
