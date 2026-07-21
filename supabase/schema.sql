-- Выполните файл целиком в Supabase Dashboard → SQL Editor.
-- В Authentication → Providers включите Anonymous sign-ins.

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  release_year smallint check (release_year between 1888 and 2100),
  created_at timestamptz not null default now()
);

alter table public.favorites enable row level security;

create policy "Users can read their own favorites"
on public.favorites for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can add their own favorites"
on public.favorites for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own favorites"
on public.favorites for delete to authenticated
using ((select auth.uid()) = user_id);
