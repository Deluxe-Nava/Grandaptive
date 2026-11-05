-- Backend v0.1. Apply to a NEW Supabase project, never an unrelated database.
-- No clinical protocol or live-provider configuration is implied by this migration.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- Eight-hour absolute session age is an implementation proposal, not an approved policy for participants.
create or replace function private.session_active_for(p_user_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and p_session_id is not null and exists (
    select 1 from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id
      and s.created_at > now() - interval '8 hours'
      and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz > now())
  );
$$;
revoke all on function private.session_active_for(uuid,uuid) from public, anon, authenticated;

create or replace function private.session_is_active()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare session_uuid uuid;
begin
  if auth.uid() is null then return false; end if;
  session_uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
  return private.session_active_for(auth.uid(), session_uuid);
exception when invalid_text_representation then return false;
end;
$$;
revoke all on function private.session_is_active() from public, anon, authenticated;
grant execute on function private.session_is_active() to authenticated, service_role;

create or replace function public.assert_live_session()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.session_is_active(); $$;
revoke all on function public.assert_live_session() from public, anon, authenticated;
grant execute on function public.assert_live_session() to authenticated;

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null check (length(btrim(text)) > 0 and length(text) <= 8000),
  version integer not null default 1 check (version >= 1),
  available_for_analysis boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index entries_user_created on public.entries(user_id, created_at desc);

create table public.account_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  ai_enabled boolean not null default false,
  conversation boolean not null default false,
  patterns boolean not null default false,
  profile_memory boolean not null default false,
  authorization_revision integer not null default 0 check (authorization_revision >= 0),
  settings jsonb not null default '{"tone":"neutral","length":"brief","listenOnly":true,"followUp":false,"settingsRevision":0}'::jsonb
    check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 4096),
  interface_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(interface_settings) = 'object' and octet_length(interface_settings::text) <= 4096)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_id uuid,
  safety_state text not null default 'normal' check (safety_state in ('normal', 'paused')),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (entry_id, user_id) references public.entries(id, user_id) on delete cascade
);
create index conversations_user_entry on public.conversations(user_id, entry_id);

create table public.interpretations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_id uuid not null,
  entry_version integer not null check (entry_version >= 1),
  type text not null check (type in ('accompany','summary','interpret','communicate','pattern')),
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 32000),
  simulation boolean not null default true,
  context_profile_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (entry_id, user_id) references public.entries(id, user_id) on delete cascade
);
create index interpretations_user_entry on public.interpretations(user_id, entry_id);
create index interpretations_profile_context on public.interpretations using gin(context_profile_ids);

create table public.profile_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('communication','sensory','energy','social','strategies')),
  text text not null check (length(btrim(text)) > 0 and length(text) <= 2000),
  origin text not null default 'user' check (origin in ('user','ai')),
  simulation boolean not null default false,
  status text not null default 'accepted' check (status in ('pending','accepted','rejected','archived')),
  pattern_key text check (pattern_key is null or length(pattern_key) between 1 and 256),
  context_profile_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (origin <> 'user' or status in ('accepted', 'archived'))
);
create index profile_items_user_status on public.profile_items(user_id, status);
create index profile_items_profile_context on public.profile_items using gin(context_profile_ids);
create unique index profile_pattern_identity on public.profile_items(user_id,pattern_key) where origin='ai' and pattern_key is not null;

create table public.profile_item_sources (
  profile_item_id uuid not null,
  entry_id uuid not null,
  entry_version integer not null check (entry_version >= 1),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (profile_item_id, entry_id),
  foreign key (profile_item_id, user_id) references public.profile_items(id, user_id) on delete cascade,
  foreign key (entry_id, user_id) references public.entries(id, user_id) on delete cascade
);
create index profile_sources_user_entry on public.profile_item_sources(user_id, entry_id);

create table public.rejected_patterns (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pattern_key text not null check (length(pattern_key) between 1 and 256),
  primary key (user_id, pattern_key)
);

create or replace function private.entry_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'IMMUTABLE_IDENTITY' using errcode = '42501';
  end if;
  new.created_at := old.created_at;
  new.version := old.version + case when new.text is distinct from old.text then 1 else 0 end;
  new.updated_at := now();
  return new;
end;
$$;
create trigger entries_version before update on public.entries for each row execute function private.entry_version();

create or replace function private.preference_revision()
returns trigger language plpgsql set search_path = '' as $$
declare previous_revision integer;
begin
  new.settings := '{"tone":"neutral","length":"brief","listenOnly":true,"followUp":false,"settingsRevision":0}'::jsonb || new.settings;
  if new.settings->>'tone' is null or new.settings->>'length' is null
    or new.settings->>'tone' not in ('neutral','warm','practical') or new.settings->>'length' not in ('brief','detailed')
    or jsonb_typeof(new.settings->'listenOnly') <> 'boolean' or jsonb_typeof(new.settings->'followUp') <> 'boolean'
    or (new.settings - array['tone','length','listenOnly','followUp','settingsRevision']) <> '{}'::jsonb then
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
create trigger preferences_revision before insert or update on public.account_preferences for each row execute function private.preference_revision();

create or replace function private.conversation_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.entry_id is distinct from old.entry_id then
    raise exception 'IMMUTABLE_CONVERSATION' using errcode = '42501';
  end if;
  if old.safety_state = 'paused' and new.safety_state <> 'paused' then
    raise exception 'SAFETY_PAUSED' using errcode = '42501';
  end if;
  new.created_at := old.created_at;
  return new;
end;
$$;
create trigger conversation_guard before update on public.conversations for each row execute function private.conversation_guard();

create or replace function private.profile_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.origin is distinct from old.origin
    or new.simulation is distinct from old.simulation or new.pattern_key is distinct from old.pattern_key or new.context_profile_ids is distinct from old.context_profile_ids then
    raise exception 'IMMUTABLE_PROVENANCE' using errcode = '42501';
  end if;
  if old.status in ('rejected', 'archived') and new.status not in ('rejected', 'archived') then
    raise exception 'INVALID_TRANSITION' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
create trigger profile_guard before update on public.profile_items for each row execute function private.profile_guard();

create or replace function private.delete_profile_context_derivatives()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.interpretations where user_id=old.user_id and context_profile_ids @> array[old.id];
  delete from public.profile_items where user_id=old.user_id and id <> old.id and context_profile_ids @> array[old.id];
  return old;
end;
$$;
create trigger profile_context_cascade after delete on public.profile_items for each row execute function private.delete_profile_context_derivatives();

-- Supabase exposes public tables via REST. Every table is deny-by-default under RLS.
do $$
declare t text;
begin
  foreach t in array array['entries','account_preferences','conversations','interpretations','profile_items','profile_item_sources','rejected_patterns'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('create policy own_active_session on public.%I for all to authenticated using (user_id = (select auth.uid()) and (select private.session_is_active())) with check (user_id = (select auth.uid()) and (select private.session_is_active()))', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end;
$$;

grant insert (text, available_for_analysis), update (text, available_for_analysis) on public.entries to authenticated;
grant insert (ai_enabled, conversation, patterns, profile_memory, settings, interface_settings),
  update (ai_enabled, conversation, patterns, profile_memory, settings, interface_settings)
  on public.account_preferences to authenticated;
grant insert (entry_id) on public.conversations to authenticated;
grant update (safety_state) on public.conversations to authenticated;
grant delete on public.conversations, public.interpretations, public.profile_items to authenticated;
grant insert (category, text), update (category, text) on public.profile_items to authenticated;
-- Interpretations, AI proposals, sources and rejected-pattern keys are server-owned writes.

create or replace function public.delete_entry(p_entry_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid();
begin
  if owner is null or not private.session_is_active() then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform 1 from public.entries where id = p_entry_id and user_id = owner for update;
  if not found then return false; end if;
  -- Conservative first cut: delete affected profile items, even when they have other sources.
  -- The API must display this scope before confirmation; preserving one as manual stays [D].
  delete from public.profile_items p where p.user_id = owner and exists (
    select 1 from public.profile_item_sources s where s.profile_item_id = p.id and s.user_id = owner and s.entry_id = p_entry_id
  );
  delete from public.entries where id = p_entry_id and user_id = owner;
  return true;
end;
$$;
revoke all on function public.delete_entry(uuid) from public, anon, authenticated;
grant execute on function public.delete_entry(uuid) to authenticated;

create or replace function public.decide_profile_item(p_id uuid, p_decision text, p_text text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.profile_items; owner uuid := auth.uid();
begin
  if owner is null or not private.session_is_active() then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform 1 from public.account_preferences where user_id=owner for update;
  select * into item from public.profile_items where id = p_id and user_id = owner for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if p_decision is null or p_decision not in ('accept', 'edit', 'reject', 'archive') then raise exception 'INVALID_DECISION' using errcode = '22023'; end if;
  if p_decision = 'archive' then
    update public.profile_items set status = 'archived' where id = p_id returning * into item;
  else
    if item.origin <> 'ai' or item.status <> 'pending' then raise exception 'INVALID_TRANSITION' using errcode = '23514'; end if;
    if p_decision = 'edit' and (p_text is null or length(btrim(p_text)) = 0 or length(p_text) > 2000) then
      raise exception 'INVALID_TEXT' using errcode = '22023';
    end if;
    update public.profile_items set status = case when p_decision = 'reject' then 'rejected' else 'accepted' end,
      text = case when p_decision = 'edit' then p_text else text end
      where id = p_id returning * into item;
    if p_decision = 'reject' and item.pattern_key is not null then
      insert into public.rejected_patterns(user_id,pattern_key) values(owner,item.pattern_key) on conflict do nothing;
    end if;
  end if;
  return to_jsonb(item);
end;
$$;
revoke all on function public.decide_profile_item(uuid,text,text) from public, anon, authenticated;
grant execute on function public.decide_profile_item(uuid,text,text) to authenticated;

-- Called only after the BFF validates its signed receipt; database closes the revocation/version race.
create or replace function public.save_ai_interpretation(
  p_user_id uuid, p_entry_id uuid, p_entry_version integer, p_type text, p_content jsonb,
  p_simulation boolean, p_authorization_revision integer, p_settings_revision integer,
  p_conversation_id uuid, p_session_id uuid, p_profile_item_ids uuid[] default '{}', p_profile_versions jsonb default '{}' 
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare prefs public.account_preferences; entry public.entries; result_id uuid; conv public.conversations; profile_id uuid;
begin
  perform 1 from auth.sessions where id=p_session_id and user_id=p_user_id for key share;
  if not private.session_active_for(p_user_id,p_session_id) then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into prefs from public.account_preferences where user_id=p_user_id for update;
  if not found or not prefs.ai_enabled or not prefs.conversation then raise exception 'CONSENT_REQUIRED' using errcode = '42501'; end if;
  if prefs.authorization_revision is distinct from p_authorization_revision or (prefs.settings->>'settingsRevision')::integer is distinct from p_settings_revision then
    raise exception 'STALE_REQUEST' using errcode = '40001';
  end if;
  select * into entry from public.entries where id=p_entry_id and user_id=p_user_id for update;
  if not found or entry.version is distinct from p_entry_version then raise exception 'STALE_REQUEST' using errcode = '40001'; end if;
  select * into conv from public.conversations where id=p_conversation_id and user_id=p_user_id for update;
  if not found or conv.entry_id is distinct from p_entry_id then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  if conv.safety_state='paused' then raise exception 'SAFETY_PAUSED' using errcode = '42501'; end if;
  if p_profile_item_ids is null or cardinality(p_profile_item_ids) > 20 then raise exception 'INVALID_PROFILE_CONTEXT' using errcode='22023'; end if;
  if cardinality(p_profile_item_ids)>0 and not prefs.profile_memory then raise exception 'CONSENT_REQUIRED' using errcode='42501'; end if;
  for profile_id in select distinct unnest(p_profile_item_ids) order by 1 loop
    perform 1 from public.profile_items where id=profile_id and user_id=p_user_id and status='accepted'
      and updated_at = (p_profile_versions->>profile_id::text)::timestamptz for share;
    if not found then raise exception 'STALE_REQUEST' using errcode='40001'; end if;
  end loop;
  if p_type not in ('accompany','summary','interpret','communicate') or p_type is null or p_content->>'type' is distinct from p_type then
    raise exception 'INVALID_CONTENT' using errcode = '22023';
  end if;
  insert into public.interpretations(user_id,entry_id,entry_version,type,content,simulation,context_profile_ids)
    values(p_user_id,p_entry_id,p_entry_version,p_type,p_content,p_simulation,p_profile_item_ids) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.save_ai_interpretation(uuid,uuid,integer,text,jsonb,boolean,integer,integer,uuid,uuid,uuid[],jsonb) from public, anon, authenticated;
grant execute on function public.save_ai_interpretation(uuid,uuid,integer,text,jsonb,boolean,integer,integer,uuid,uuid,uuid[],jsonb) to service_role;

create or replace function public.save_pattern_proposal(
  p_user_id uuid, p_sources jsonb, p_category text, p_text text, p_pattern_key text,
  p_authorization_revision integer, p_settings_revision integer, p_session_id uuid, p_conversation_id uuid, p_simulation boolean, p_profile_item_ids uuid[] default '{}', p_profile_versions jsonb default '{}'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare prefs public.account_preferences; source jsonb; entry public.entries; result_id uuid; source_count integer; profile_id uuid;
begin
  perform 1 from auth.sessions where id=p_session_id and user_id=p_user_id for key share;
  if not private.session_active_for(p_user_id,p_session_id) then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into prefs from public.account_preferences where user_id=p_user_id for update;
  if not found or not prefs.ai_enabled or not prefs.patterns then raise exception 'CONSENT_REQUIRED' using errcode = '42501'; end if;
  if prefs.authorization_revision is distinct from p_authorization_revision or (prefs.settings->>'settingsRevision')::integer is distinct from p_settings_revision then
    raise exception 'STALE_REQUEST' using errcode = '40001';
  end if;
  if jsonb_typeof(p_sources) is distinct from 'array' then raise exception 'INVALID_SOURCES' using errcode='22023'; end if;
  source_count := jsonb_array_length(p_sources);
  if source_count < 1 or source_count > 10 or (select count(distinct value->>'entryId') from jsonb_array_elements(p_sources)) <> source_count then
    raise exception 'INVALID_SOURCES' using errcode='22023';
  end if;
  if p_pattern_key is null or length(p_pattern_key) not between 1 and 256 then raise exception 'INVALID_PATTERN_KEY' using errcode='22023'; end if;
  if exists(select 1 from public.rejected_patterns where user_id=p_user_id and pattern_key=p_pattern_key) then
    raise exception 'PATTERN_REJECTED' using errcode='23514';
  end if;
  for source in select value from jsonb_array_elements(p_sources) order by value->>'entryId' loop
    select * into entry from public.entries where id=(source->>'entryId')::uuid and user_id=p_user_id for update;
    if not found or not entry.available_for_analysis or entry.version is distinct from (source->>'entryVersion')::integer then
      raise exception 'STALE_REQUEST' using errcode='40001';
    end if;
  end loop;
  if p_profile_item_ids is null or cardinality(p_profile_item_ids) > 20 then raise exception 'INVALID_PROFILE_CONTEXT' using errcode='22023'; end if;
  if cardinality(p_profile_item_ids)>0 and not prefs.profile_memory then raise exception 'CONSENT_REQUIRED' using errcode='42501'; end if;
  for profile_id in select distinct unnest(p_profile_item_ids) order by 1 loop
    perform 1 from public.profile_items where id=profile_id and user_id=p_user_id and status='accepted'
      and updated_at = (p_profile_versions->>profile_id::text)::timestamptz for share;
    if not found then raise exception 'STALE_REQUEST' using errcode='40001'; end if;
  end loop;
  perform 1 from public.conversations where id=p_conversation_id and user_id=p_user_id and safety_state='normal' for update;
  if not found then raise exception 'SAFETY_PAUSED' using errcode='42501'; end if;
  insert into public.profile_items(user_id,category,text,origin,status,pattern_key,context_profile_ids,simulation)
    values(p_user_id,p_category,p_text,'ai','pending',p_pattern_key,p_profile_item_ids,p_simulation) returning id into result_id;
  for source in select value from jsonb_array_elements(p_sources) loop
    insert into public.profile_item_sources(profile_item_id,entry_id,entry_version,user_id)
      values(result_id,(source->>'entryId')::uuid,(source->>'entryVersion')::integer,p_user_id);
  end loop;
  return result_id;
end;
$$;
revoke all on function public.save_pattern_proposal(uuid,jsonb,text,text,text,integer,integer,uuid,uuid,boolean,uuid[],jsonb) from public, anon, authenticated;
grant execute on function public.save_pattern_proposal(uuid,jsonb,text,text,text,integer,integer,uuid,uuid,boolean,uuid[],jsonb) to service_role;

create table private.rate_limits (
  key text not null,
  window_seconds integer not null,
  bucket bigint not null,
  hits integer not null default 1,
  expires_at timestamptz not null,
  primary key (key, window_seconds, bucket)
);
create index rate_limits_expiry on private.rate_limits(expires_at);
revoke all on table private.rate_limits from public, anon, authenticated;

create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_bucket bigint; total integer; server_now timestamptz := clock_timestamp();
begin
  if p_key is null or length(p_key) not between 1 and 256 or p_limit is null or p_limit not between 1 and 100000
    or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'INVALID_RATE_LIMIT' using errcode = '22023';
  end if;
  current_bucket := floor(extract(epoch from server_now) / p_window_seconds)::bigint;
  insert into private.rate_limits(key,window_seconds,bucket,hits,expires_at)
    values(p_key,p_window_seconds,current_bucket,1,to_timestamp((current_bucket + 1) * p_window_seconds) + interval '1 hour')
    on conflict (key,window_seconds,bucket) do update set hits = least(private.rate_limits.hits + 1, p_limit + 1)
    returning hits into total;
  -- Bounded cleanup, no diary contents or raw IP addresses. p_key must be an HMAC generated by the server.
  delete from private.rate_limits where ctid in (
    select ctid from private.rate_limits where expires_at < server_now order by expires_at limit 100
  );
  return total <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

-- Trigger functions must not become callable public RPC surfaces.
revoke all on function private.entry_version() from public, anon, authenticated;
revoke all on function private.preference_revision() from public, anon, authenticated;
revoke all on function private.conversation_guard() from public, anon, authenticated;
revoke all on function private.profile_guard() from public, anon, authenticated;
revoke all on function private.delete_profile_context_derivatives() from public, anon, authenticated;

-- Tope inicial de 100 intentos REALES de OpenAI por proyecto, no se reinicia cada día.
-- Se reserva antes de enviar: fallos/timeouts también consumen el cupo por prudencia.
create table private.ai_budget (id boolean primary key default true check(id), calls integer not null default 0);
insert into private.ai_budget(id,calls) values(true,0);
revoke all on private.ai_budget from public,anon,authenticated;
create or replace function public.reserve_ai_call()
returns boolean language plpgsql security definer set search_path='' as $$
declare reserved integer;
begin
  update private.ai_budget set calls=calls+1 where id=true and calls<100 returning calls into reserved;
  return reserved is not null;
end;
$$;
revoke all on function public.reserve_ai_call() from public,anon,authenticated;
grant execute on function public.reserve_ai_call() to service_role;
commit;
