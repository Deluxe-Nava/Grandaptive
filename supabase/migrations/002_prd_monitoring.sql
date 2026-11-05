-- Upgrade after 001_backend.sql. No tables/data are dropped.
-- Apply once to the existing GRANDAPTIVE project, before deploying API v0.3.
begin;
-- The closed demo also applies to direct PostgREST access, not just BFF routes.
create or replace function private.session_active_for(p_user_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_user_id is not null and p_session_id is not null and exists (
    select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=p_session_id and s.user_id=p_user_id
      and u.raw_app_meta_data->'challenge_member' = 'true'::jsonb
      and s.created_at > now()-interval '8 hours'
      and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>now())
  );
$$;
create or replace function private.preference_revision()
returns trigger language plpgsql set search_path = '' as $$
declare previous_revision integer;
begin
  new.settings := '{"tone":"neutral","length":"brief","listenOnly":true,"followUp":false,"questionStyle":"direct","useExamples":false,"literalLanguage":true,"modality":"text","settingsRevision":0}'::jsonb || new.settings;
  if new.settings->>'tone' is null or new.settings->>'length' is null
    or new.settings->>'tone' not in ('neutral','warm','practical') or new.settings->>'length' not in ('brief','detailed')
    or jsonb_typeof(new.settings->'listenOnly') <> 'boolean' or jsonb_typeof(new.settings->'followUp') <> 'boolean'
    or new.settings->>'questionStyle' is null or new.settings->>'questionStyle' not in ('direct','open')
    or jsonb_typeof(new.settings->'useExamples') is distinct from 'boolean'
    or jsonb_typeof(new.settings->'literalLanguage') is distinct from 'boolean'
    or new.settings->>'modality' is distinct from 'text'
    or (new.settings - array['tone','length','listenOnly','followUp','questionStyle','useExamples','literalLanguage','modality','settingsRevision']) <> '{}'::jsonb then
    raise exception 'INVALID_SETTINGS' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.authorization_revision := 0;
    new.settings := jsonb_set(new.settings, '{settingsRevision}', '0'::jsonb);
    return new;
  end if;
  if new.user_id is distinct from old.user_id then raise exception 'IMMUTABLE_OWNER' using errcode = '42501'; end if;
  new.authorization_revision := old.authorization_revision + case when
    (new.ai_enabled, new.conversation, new.patterns, new.profile_memory) is distinct from
    (old.ai_enabled, old.conversation, old.patterns, old.profile_memory) then 1 else 0 end;
  previous_revision := coalesce((old.settings->>'settingsRevision')::integer, 0);
  new.settings := jsonb_set(new.settings, '{settingsRevision}', to_jsonb(previous_revision + case
    when (new.settings - 'settingsRevision') is distinct from (old.settings - 'settingsRevision') then 1 else 0 end));
  return new;
end;
$$;

update public.account_preferences set settings=settings;

alter table public.interpretations add column rejected_readings integer[] not null default '{}';
create or replace function public.set_reading_feedback(p_id uuid,p_index integer,p_fits boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.interpretations; owner uuid := auth.uid();
begin
  if owner is null or not private.session_is_active() then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into item from public.interpretations where id=p_id and user_id=owner for update;
  if not found then raise exception 'NOT_FOUND' using errcode='P0002'; end if;
  if item.type <> 'interpret' or p_index is null or p_fits is null or p_index<0
     or jsonb_typeof(item.content->'possibleReadings') is distinct from 'array'
     or p_index>=jsonb_array_length(item.content->'possibleReadings') then
    raise exception 'INVALID_READING' using errcode='22023';
  end if;
  update public.interpretations set rejected_readings=case when p_fits then array_remove(rejected_readings,p_index)
    else array(select distinct x from unnest(rejected_readings || p_index) x order by x) end
    where id=p_id and user_id=owner returning * into item;
  return to_jsonb(item);
end;
$$;
revoke all on function public.set_reading_feedback(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.set_reading_feedback(uuid,integer,boolean) to authenticated;

-- Counts only. No diary text, reason, diagnostic classification, IP or conversation history.
create table private.safety_counts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  activations integer not null default 0 check(activations>=0)
);
revoke all on private.safety_counts from public,anon,authenticated;
insert into private.safety_counts(user_id,activations)
  select user_id,count(*)::integer from public.conversations where safety_state='paused' group by user_id;
create or replace function private.count_safety_pause()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.safety_state='paused' and (tg_op='INSERT' or old.safety_state is distinct from 'paused') then
    insert into private.safety_counts(user_id,activations) values(new.user_id,1)
      on conflict(user_id) do update set activations=private.safety_counts.activations+1;
  end if;
  return new;
end;
$$;
revoke all on function private.count_safety_pause() from public,anon,authenticated;
create trigger count_safety_pause after insert or update on public.conversations for each row execute function private.count_safety_pause();
create or replace function public.own_safety_activation_count()
returns integer language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.session_is_active() then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  return coalesce((select activations from private.safety_counts where user_id=auth.uid()),0);
end;
$$;
revoke all on function public.own_safety_activation_count() from public,anon,authenticated;
grant execute on function public.own_safety_activation_count() to authenticated;

-- Public database probe with no private output or writes. BFF /ready requires a separate monitor token.
create or replace function public.backend_readiness()
returns integer language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.entries limit 0;
  perform 1 from public.interpretations limit 0;
  return 2;
end;
$$;
revoke all on function public.backend_readiness() from public,anon,authenticated;
grant execute on function public.backend_readiness() to anon,service_role;

create or replace function public.ai_budget_status()
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('used',calls,'limit',100,'remaining',greatest(0,100-calls),'warning',calls>=80)
  from private.ai_budget where id=true;
$$;
revoke all on function public.ai_budget_status() from public,anon,authenticated;
grant execute on function public.ai_budget_status() to service_role;
commit;
