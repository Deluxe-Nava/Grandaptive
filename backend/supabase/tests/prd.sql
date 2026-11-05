-- Disposable fixtures only; rollback at end. Run after migrations 001 and 002.
begin;
insert into auth.users(id,raw_app_meta_data) values ('10000000-0000-4000-8000-000000000011','{"challenge_member":true}'),('10000000-0000-4000-8000-000000000012','{}');
insert into auth.sessions(id,user_id,created_at) values
 ('20000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011',now());
insert into public.entries(id,user_id,text) values
 ('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011','Synthetic fixture'),
 ('30000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000012','Other fixture');
insert into public.interpretations(id,user_id,entry_id,entry_version,type,content) values
 ('60000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011',1,'interpret','{"type":"interpret","possibleReadings":["Quizá faltó contexto.","Quizá faltó tiempo."]}'),
 ('60000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000012',1,'interpret','{"type":"interpret","possibleReadings":["Quizá.","Tal vez."]}');
insert into public.conversations(id,user_id,entry_id) values ('40000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000011","session_id":"20000000-0000-4000-8000-000000000011"}',true);
insert into public.account_preferences(settings) values ('{"questionStyle":"open","useExamples":true,"literalLanguage":false,"modality":"text"}');
do $$ declare item jsonb; begin
  if (select settings->>'questionStyle' from public.account_preferences) <> 'open' then raise exception 'FAIL: preference lost'; end if;
  begin
    update public.account_preferences set settings='{"modality":"voice"}';
    raise exception 'FAIL: voice outside scope accepted';
  exception when invalid_parameter_value then null; end;
  begin
    update public.account_preferences set settings='{"questionStyle":null}';
    raise exception 'FAIL: invalid null preference accepted';
  exception when invalid_parameter_value then null; end;
  item:=public.set_reading_feedback('60000000-0000-4000-8000-000000000011',0,false);
  item:=public.set_reading_feedback('60000000-0000-4000-8000-000000000011',0,false);
  if item->'rejected_readings' <> '[0]'::jsonb then raise exception 'FAIL: feedback missing or duplicated'; end if;
  if item->'content'->'possibleReadings'->>0 <> 'Quizá faltó contexto.' then raise exception 'FAIL: original AI overwritten'; end if;
  item:=public.set_reading_feedback('60000000-0000-4000-8000-000000000011',0,true);
  if item->'rejected_readings' <> '[]'::jsonb then raise exception 'FAIL: feedback undo'; end if;
  begin
    perform public.set_reading_feedback('60000000-0000-4000-8000-000000000011',2,false);
    raise exception 'FAIL: out of range reading';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.set_reading_feedback('60000000-0000-4000-8000-000000000012',0,false);
    raise exception 'FAIL: cross-user feedback';
  exception when no_data_found then null; end;
  begin
    update public.interpretations set rejected_readings='{0}';
    raise exception 'FAIL: direct feedback bypass';
  exception when insufficient_privilege then null; end;
  if public.own_safety_activation_count() <> 0 then raise exception 'FAIL: initial count'; end if;
  update public.conversations set safety_state='paused' where id='40000000-0000-4000-8000-000000000011';
  update public.conversations set safety_state='paused' where id='40000000-0000-4000-8000-000000000011';
  if public.own_safety_activation_count() <> 1 then raise exception 'FAIL: duplicate pause count'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  if public.backend_readiness() <> 2 then raise exception 'FAIL: readiness'; end if;
  begin
    perform public.own_safety_activation_count();
    raise exception 'FAIL: anonymous safety stats';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update auth.users set raw_app_meta_data='{}' where id='10000000-0000-4000-8000-000000000011';
set local role authenticated;
do $$ begin
  if public.assert_live_session() then raise exception 'FAIL: removed membership accepted'; end if;
  if exists(select 1 from public.entries) then raise exception 'FAIL: uninvited direct database access'; end if;
end $$;
reset role;
delete from auth.users where id='10000000-0000-4000-8000-000000000011';
do $$ begin
  if exists(select 1 from private.safety_counts where user_id='10000000-0000-4000-8000-000000000011') then raise exception 'FAIL: count survives account deletion'; end if;
end $$;
rollback;
