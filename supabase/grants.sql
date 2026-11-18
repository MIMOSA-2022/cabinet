-- 补上权限：登入的人才能用这几张表（没登入的人什么都拿不到）
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.library_entries to authenticated;
grant select, insert, update on public.profiles to authenticated;
revoke all on public.projects, public.library_entries, public.profiles from anon;
