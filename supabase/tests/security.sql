-- LOCAL disposable Supabase database only, after 001_backend.sql.
-- Integration test, NOT executed by npm test. psql -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
-- Requires postgres/admin solely to create synthetic auth fixtures. Everything rolls back.
begin;

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','synthetic-a@example.invalid','',now(),now(),now()),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','synthetic-b@example.invalid','',now(),now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',now(),now()),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',now(),now());
insert into public.entries(id,user_id,text) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Synthetic A only'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Synthetic B only');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"20000000-0000-4000-8000-000000000001"}',true);
do $$ begin
  if not public.assert_live_session() then raise exception 'FAIL: valid session denied'; end if;
  if (select count(*) from public.entries) <> 1 then raise exception 'FAIL: account isolation'; end if;
  if exists(select 1 from public.entries where id='30000000-0000-4000-8000-000000000002') then raise exception 'FAIL: B visible to A'; end if;
  if public.delete_entry('30000000-0000-4000-8000-000000000002') then raise exception 'FAIL: A deleted B'; end if;
  begin
    insert into public.entries(user_id,text) values ('10000000-0000-4000-8000-000000000002','forged owner');
    raise exception 'FAIL: forged owner accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.entries where id='30000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: direct DELETE bypasses cascade RPC';
  exception when insufficient_privilege then null; end;
  begin
    perform public.consume_rate_limit('forged-key',100,60);
    raise exception 'FAIL: authenticated caller can change rate limits';
  exception when insufficient_privilege then null; end;
end $$;

update public.entries set text='Synthetic A edited' where id='30000000-0000-4000-8000-000000000001' and version=1;
do $$ begin
  if (select version from public.entries where id='30000000-0000-4000-8000-000000000001') <> 2 then raise exception 'FAIL: version not incremented'; end if;
end $$;
insert into public.account_preferences(ai_enabled,conversation) values(false,false);
update public.account_preferences set ai_enabled=true, conversation=true, settings='{"tone":"warm","settingsRevision":999}';
do $$ begin
  if (select authorization_revision from public.account_preferences) <> 1 then raise exception 'FAIL: consent revision'; end if;
  if (select (settings->>'settingsRevision')::integer from public.account_preferences) <> 1 then raise exception 'FAIL: settings revision is client-controlled'; end if;
end $$;

reset role;
-- Server fixture demonstrates persistent pause and relational ownership (not risk detection).
insert into public.conversations(id,user_id,entry_id,safety_state) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','paused'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','normal');
do $$ begin
  begin
    update public.conversations set safety_state='normal' where id='40000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: pause was reset';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.conversations(user_id,entry_id) values('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
    raise exception 'FAIL: foreign owner source accepted';
  exception when foreign_key_violation then null; end;
end $$;
set local role service_role;
do $$ begin
  perform public.save_ai_interpretation(
    '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',2,'summary',
    '{"type":"summary","text":"Saved synthetic response"}',true,1,1,
    '40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001'
  );
  begin
    perform public.save_ai_interpretation(
      '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'summary',
      '{"type":"summary","text":"Stale synthetic response"}',true,1,1,
      '40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001'
    );
    raise exception 'FAIL: stale source accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_ai_interpretation(
      '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',2,'summary',
      '{"type":"summary","text":"Paused response"}',true,1,1,
      '40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'
    );
    raise exception 'FAIL: paused conversation accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Exact profile snapshot and paused pattern are rechecked inside the save transaction.
update public.account_preferences set profile_memory=true, patterns=true where user_id='10000000-0000-4000-8000-000000000001';
update public.entries set available_for_analysis=true where id='30000000-0000-4000-8000-000000000001';
insert into public.profile_items(id,user_id,category,text) values ('50000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','sensory','Synthetic context');
set local role service_role;
do $$ begin
  begin
    perform public.save_ai_interpretation(
      '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',2,'summary',
      '{"type":"summary","text":"Stale profile"}',true,2,1,
      '40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',
      array['50000000-0000-4000-8000-000000000099']::uuid[], '{"50000000-0000-4000-8000-000000000099":"2000-01-01T00:00:00Z"}'
    );
    raise exception 'FAIL: stale profile saved';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pattern_proposal(
      '10000000-0000-4000-8000-000000000001','[{"entryId":"30000000-0000-4000-8000-000000000001","entryVersion":2}]',
      'sensory','Posible señal sintética','synthetic_pattern',2,1,
      '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',true
    );
    raise exception 'FAIL: pattern saved in paused conversation';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from public.profile_items where id='50000000-0000-4000-8000-000000000099';
reset role;
insert into public.profile_items(id,user_id,category,text,origin,status) values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','sensory','Synthetic suggested item','ai','pending');
insert into public.profile_item_sources(profile_item_id,entry_id,entry_version,user_id) values
 ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',2,'10000000-0000-4000-8000-000000000001');
insert into public.interpretations(user_id,entry_id,entry_version,type,content) values
 ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',2,'summary','{"type":"summary","text":"Synthetic"}');
set local role authenticated;
do $$ begin
  begin
    update public.profile_items set origin='user',status='accepted' where id='50000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: provenance/status mass assignment';
  exception when insufficient_privilege then null; end;
  perform public.decide_profile_item('50000000-0000-4000-8000-000000000001','accept');
  if not public.delete_entry('30000000-0000-4000-8000-000000000001') then raise exception 'FAIL: own entry delete'; end if;
  if exists(select 1 from public.profile_items) or exists(select 1 from public.interpretations) or exists(select 1 from public.conversations) then
    raise exception 'FAIL: cascade left derived records';
  end if;
end $$;

reset role;
delete from auth.sessions where id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  if public.assert_live_session() then raise exception 'FAIL: revoked session accepted'; end if;
  if exists(select 1 from public.account_preferences) then raise exception 'FAIL: revoked session can read'; end if;
end $$;

reset role;
update auth.sessions set created_at=now()-interval '9 hours' where id='20000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"20000000-0000-4000-8000-000000000002"}',true);
do $$ begin
  if public.assert_live_session() then raise exception 'FAIL: absolute 8h session expired but accepted'; end if;
  if exists(select 1 from public.entries) then raise exception 'FAIL: expired session can read'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform count(*) from public.entries;
    raise exception 'FAIL: anon read granted';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role service_role;
do $$ begin
  if not public.consume_rate_limit('synthetic-hmac-key',1,60) then raise exception 'FAIL: first rate request denied'; end if;
  if public.consume_rate_limit('synthetic-hmac-key',1,60) then raise exception 'FAIL: rate limit not enforced'; end if;
  for i in 1..100 loop
    if not public.reserve_ai_call() then raise exception 'FAIL: budget denied early'; end if;
  end loop;
  if public.reserve_ai_call() then raise exception 'FAIL: lifetime budget exceeded'; end if;
end $$;
reset role;
rollback;
-- Success means the statements raised no exception; no fixtures remain.
