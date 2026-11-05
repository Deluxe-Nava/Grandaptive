-- Diagnostic only: SELECT statements, no writes, no user content or credentials.
-- Run in the SQL Editor of the GRANDAPTIVE Supabase project.
-- PASS checks installation metadata, not two-user authorization or full migration integrity.

with expected(name) as (values
  ('entries'), ('account_preferences'), ('conversations'), ('interpretations'),
  ('profile_items'), ('profile_item_sources'), ('rejected_patterns'))
select e.name as public_table,
  case when c.oid is null then 'MISSING'
       when not c.relrowsecurity then 'FAIL_RLS_DISABLED'
       when not exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polname='own_active_session') then 'FAIL_POLICY_MISSING'
       else 'PASS' end as result
from expected e left join pg_class c on c.oid=to_regclass('public.' || e.name)
order by e.name;

with expected(signature,access_kind) as (values
  ('public.assert_live_session()', 'user'),
  ('public.delete_entry(uuid)', 'user'),
  ('public.decide_profile_item(uuid,text,text)', 'user'),
  ('public.set_reading_feedback(uuid,integer,boolean)', 'user'),
  ('public.own_safety_activation_count()', 'user'),
  ('public.consume_rate_limit(text,integer,integer)', 'server'),
  ('public.reserve_ai_call()', 'server'),
  ('public.ai_budget_status()', 'server'),
  ('public.backend_readiness()', 'probe')),
resolved as (select *, to_regprocedure(signature) as fn from expected)
select signature,
  case when fn is null then 'MISSING'
       when access_kind='user' and (has_function_privilege('anon',fn,'EXECUTE') or not has_function_privilege('authenticated',fn,'EXECUTE')) then 'FAIL_GRANTS'
       when access_kind='server' and (has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE') or not has_function_privilege('service_role',fn,'EXECUTE')) then 'FAIL_GRANTS'
       when access_kind='probe' and not has_function_privilege('anon',fn,'EXECUTE') then 'FAIL_GRANTS'
       else 'PASS' end as result
from resolved order by signature;

select 'interpretations.rejected_readings' as check_name,
  case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='interpretations' and column_name='rejected_readings' and is_nullable='NO') then 'PASS' else 'MISSING' end as result
union all
select 'private.safety_counts', case when to_regclass('private.safety_counts') is not null then 'PASS' else 'MISSING' end
union all
select 'count_safety_pause trigger', case when exists(select 1 from pg_trigger where tgrelid=to_regclass('public.conversations') and tgname='count_safety_pause' and tgenabled <> 'D') then 'PASS' else 'MISSING' end
union all
select 'membership check in session_active_for', case when exists(select 1 from pg_proc where oid=to_regprocedure('private.session_active_for(uuid,uuid)') and prosrc like '%raw_app_meta_data%' and prosrc like '%challenge_member%') then 'PASS' else 'MISSING' end;
