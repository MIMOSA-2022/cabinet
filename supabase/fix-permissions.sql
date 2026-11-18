-- 补权限 + 检查（可以重复执行）
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.library_entries to authenticated;
grant select, insert, update on public.profiles to authenticated;

-- 下面会列出结果：应该看到 authenticated 有 SELECT / INSERT / UPDATE / DELETE
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('projects', 'library_entries', 'profiles')
  and grantee in ('authenticated', 'anon')
group by table_name, grantee
order by table_name, grantee;

-- 用不到的权限也拿掉（保险）
revoke truncate, trigger, references on public.projects, public.library_entries, public.profiles from anon, authenticated;
