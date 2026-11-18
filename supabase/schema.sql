-- 橱柜设计：Supabase 资料库设定
-- 用法：Supabase 网站 → 你的项目 → SQL Editor → New query → 把这整个文件贴进去 → Run
-- 可以重复执行，不会弄坏已经有的资料。

-- ---------- 使用者名字（同事之间显示"这是谁的资料"）----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: members can read" on public.profiles;
create policy "profiles: members can read" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 新帐号自动建一笔名字
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- 项目（每个人自己的，只有自己看得到）----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default '新项目',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_owner_updated on public.projects (owner, updated_at desc);
alter table public.projects enable row level security;

drop policy if exists "projects: own only" on public.projects;
create policy "projects: own only" on public.projects
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- ---------- 资料库（每人一份；所有同事都看得到；只能改自己的）----------
create table if not exists public.library_entries (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null,
  name text not null,
  data jsonb not null,
  source jsonb,            -- 从谁那里复制来的：{ owner, id }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists library_owner on public.library_entries (owner);
alter table public.library_entries enable row level security;

drop policy if exists "library: members can read all" on public.library_entries;
create policy "library: members can read all" on public.library_entries
  for select to authenticated using (true);
drop policy if exists "library: insert own" on public.library_entries;
create policy "library: insert own" on public.library_entries
  for insert to authenticated with check (owner = auth.uid());
drop policy if exists "library: update own" on public.library_entries;
create policy "library: update own" on public.library_entries
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "library: delete own" on public.library_entries;
create policy "library: delete own" on public.library_entries
  for delete to authenticated using (owner = auth.uid());

-- ---------- 权限：登入的人才能用这几张表（没登入的人什么都拿不到）----------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.library_entries to authenticated;
grant select, insert, update on public.profiles to authenticated;
revoke all on public.projects, public.library_entries, public.profiles from anon;
