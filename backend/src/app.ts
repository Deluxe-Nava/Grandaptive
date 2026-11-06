import { z } from 'zod';
import type { AIContent, Settings } from '../../shared/contracts.ts';
import { validateContent } from '../../shared/core.ts';
import { generateAI } from './ai.ts';
import { adminDatabase, userDatabase, dataOrThrow, rateLimit, type UserDatabase } from './database.ts';
import { ApiError, clearSession, cookieNames, guardRequest, openReceipt, parse, privateRateKey, readConfig, readCookie, readJson, sealReceipt, secureHeaders, setSession, type Config } from './security.ts';
import { aiSchema, consentsSchema, conversationSchema, decisionSchema, entryCreateSchema, entryPatchSchema, loginSchema, profileSchema, receiptBodySchema, receiptSchema, settingsPatchSchema, uuid } from './schemas.ts';
import { interfaceSettingsSchema, settingsSchema } from './schemas.ts';
import { authorizeMonitor } from './security.ts';
import { teamLoginSchema } from './schemas.ts';

interface Actor { id: string; sessionId: string; token: string; db: UserDatabase }
interface PreferenceRow {
  ai_enabled: boolean; conversation: boolean; patterns: boolean; profile_memory: boolean;
  authorization_revision: number; settings: Settings;
  interface_settings: unknown;
}
interface EntryRow { id: string; user_id: string; text: string; version: number; available_for_analysis: boolean; created_at: string; updated_at: string }
const emptyObject = z.object({}).strict();

async function authorize(config: Config, token: string | undefined): Promise<Actor> {
  if (!token) throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  const db = userDatabase(config, token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'AUTH_REQUIRED', 'Your session expired or is no longer valid.');
  // Registro público cerrado: sólo miembros de prueba habilitados por el responsable.
  if (data.user.app_metadata.challenge_member !== true) throw new ApiError(403, 'PILOT_CLOSED', 'Access to this prototype requires an invitation from the team.');
  const session = await db.rpc('assert_live_session');
  if (session.error || session.data !== true) throw new ApiError(401, 'SESSION_REVOKED', 'Your session expired or was closed.');
  let sessionId: string;
  try { sessionId = uuid.parse(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).session_id); }
  catch { throw new ApiError(401, 'AUTH_REQUIRED', 'Your session is not valid.'); }
  return { id: data.user.id, sessionId, token, db };
}

async function preferences(actor: Actor): Promise<PreferenceRow> {
  let result = await actor.db.from('account_preferences').select('*').eq('user_id', actor.id).maybeSingle();
  if (result.error) dataOrThrow(result);
  if (!result.data) {
    const inserted = await actor.db.from('account_preferences').insert({ ai_enabled: false });
    if (inserted.error && inserted.error.code !== '23505') dataOrThrow(inserted);
    result = await actor.db.from('account_preferences').select('*').eq('user_id', actor.id).single();
  }
  return dataOrThrow(result) as PreferenceRow;
}

function consentView(row: PreferenceRow) {
  return { aiEnabled: row.ai_enabled, conversation: row.conversation, patterns: row.patterns, profileMemory: row.profile_memory, authorizationRevision: row.authorization_revision };
}

function entryView(row: EntryRow) {
  return { id: row.id, text: row.text, version: row.version, availableForAnalysis: row.available_for_analysis, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function sources(actor: Actor, ids: string[]): Promise<EntryRow[]> {
  const rows = dataOrThrow(await actor.db.from('entries').select('*').eq('user_id', actor.id).in('id', ids)) as EntryRow[];
  if (rows.length !== ids.length) throw new ApiError(404, 'NOT_FOUND', 'Not all entries were found.');
  return ids.map(id => rows.find(row => row.id === id)!);
}

function checkPermission(pref: PreferenceRow, operation: string, rows: EntryRow[]) {
  if (!pref.ai_enabled || (operation === 'pattern' ? !pref.patterns : !pref.conversation)) throw new ApiError(403, 'CONSENT_REQUIRED', 'Turn on only the permissions you want to use before requesting this action.');
  if (operation === 'pattern' && rows.some(row => !row.available_for_analysis)) throw new ApiError(403, 'CONSENT_REQUIRED', 'Some entries are not authorized for pattern analysis.');
}

async function checkConversation(actor: Actor, conversationId: string, entryId?: string) {
  const row = dataOrThrow(await actor.db.from('conversations').select('id,entry_id,safety_state').eq('id', conversationId).eq('user_id', actor.id).maybeSingle());
  if (entryId && row.entry_id !== entryId) throw new ApiError(409, 'CONVERSATION_MISMATCH', 'This conversation belongs to another entry.');
  if (row.safety_state === 'paused') throw new ApiError(409, 'SAFETY_PAUSED', 'Interpretations are paused in this conversation.');
}

async function revalidateReceipt(actor: Actor, receipt: z.infer<typeof receiptSchema>) {
  if (receipt.userId !== actor.id || receipt.expiresAt <= Date.now()) throw new ApiError(409, 'RECEIPT_EXPIRED', 'The saveable response expired or does not belong to this account.');
  const pref = await preferences(actor);
  const rows = await sources(actor, receipt.sources.map(source => source.entryId));
  checkPermission(pref, receipt.operation, rows);
  if (pref.authorization_revision !== receipt.authorizationRevision || pref.settings.settingsRevision !== receipt.settingsRevision || rows.some((row, index) => row.version !== receipt.sources[index].entryVersion)) throw new ApiError(409, 'STALE_REQUEST', 'The context or permissions changed. The previous response was discarded.');
  await checkConversation(actor, receipt.conversationId, receipt.operation === 'pattern' ? undefined : rows[0].id);
  if (receipt.profileItemIds.length) {
    if (!pref.profile_memory) throw new ApiError(409, 'STALE_REQUEST', 'Profile memory was turned off.');
    const profile = dataOrThrow(await actor.db.from('profile_items').select('id,updated_at').eq('user_id', actor.id).eq('status', 'accepted').in('id', receipt.profileItemIds));
    if (profile.length !== receipt.profileItemIds.length || profile.some(item => item.updated_at !== receipt.profileVersions[item.id])) throw new ApiError(409, 'STALE_REQUEST', 'The profile used changed or is no longer available.');
  }
  return pref;
}

async function allRows(db: UserDatabase, table: string, userId: string, orderKeys = ['id']) {
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from(table).select('*').eq('user_id', userId);
    for (const key of orderKeys) query = query.order(key);
    const page = dataOrThrow(await query.range(offset, offset + 499));
    all.push(...page);
    if (page.length < 500) break;
    if (all.length > 10000) throw new ApiError(413, 'EXPORT_TOO_LARGE', 'The export needs additional processing. Contact the person responsible for the prototype.');
  }
  return all;
}

/** Único handler, compartido por Node local y Vercel. No registra cuerpos, cookies ni claves. */
export async function handleRequest(request: Request, configuration?: Config): Promise<Response> {
  const requestId = crypto.randomUUID();
  let headers = secureHeaders(process.env.VERCEL === '1' || process.env.NODE_ENV === 'production');
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');
    if (path === '/api/v1/health' && ['GET', 'HEAD'].includes(request.method)) {
      headers.set('X-Grandaptive-Health', 'live');
      return request.method === 'HEAD' ? new Response(null, { status: 200, headers }) : reply({ status: 'ok', version: '0.3', publicEnrollment: false, scope: 'process' });
    }
    const config = configuration ?? readConfig();
    headers = secureHeaders(config.production);
    headers.set('X-Request-Id', requestId);
    if (path === '/api/v1/ready' && ['GET', 'HEAD'].includes(request.method)) {
      authorizeMonitor(request, config.monitorToken);
      const probe = await userDatabase(config).rpc('backend_readiness');
      if (probe.error || probe.data !== 2) throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'The backend is not ready.');
      return request.method === 'HEAD' ? new Response(null, { status: 200, headers }) : reply({ status: 'ready', schemaVersion: 2 });
    }
    guardRequest(request, config.origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const body = () => readJson(request);
    const names = cookieNames(config.production);

    if (path === '/api/v1/auth/options' && request.method === 'GET') {
      return reply({ mode: config.captchaConfigured ? 'captcha' : config.teamDemoLogin ? 'team-demo' : 'closed', publicEnrollment: false });
    }

    if (path === '/api/v1/auth/login' && request.method === 'POST') {
      if (!config.captchaConfigured && !config.teamDemoLogin) throw new ApiError(503, 'CAPTCHA_NOT_CONFIGURED', 'Team access is not enabled yet.');
      const input = config.captchaConfigured ? parse(loginSchema, await body()) : parse(teamLoginSchema, await body());
      await rateLimit(config, 'auth:global', 40, 60);
      await rateLimit(config, `auth:${privateRateKey(config.secret, input.email.toLowerCase())}`, 5, 60);
      const { data, error } = await userDatabase(config).auth.signInWithPassword({ email: input.email, password: input.password, ...('captchaToken' in input && typeof input.captchaToken === 'string' ? { options: { captchaToken: input.captchaToken } } : {}) });
      if (error || !data.session) throw new ApiError(401, 'LOGIN_FAILED', 'Could not sign in. Check your details and verification.');
      try { await authorize(config, data.session.access_token); }
      catch (error) { await adminDatabase(config).auth.admin.signOut(data.session.access_token, 'local'); throw error; }
      setSession(headers, data.session, config);
      return reply({ user: { id: data.user.id }, expiresIn: Math.min(data.session.expires_in, 3600) });
    }

    if (path === '/api/v1/auth/refresh' && request.method === 'POST') {
      parse(emptyObject, await body());
      const refreshToken = readCookie(request, names.refresh);
      if (!refreshToken) throw new ApiError(401, 'AUTH_REQUIRED', 'Please sign in again.');
      await rateLimit(config, `refresh:${privateRateKey(config.secret, refreshToken)}`, 5, 60);
      const { data, error } = await userDatabase(config).auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) { clearSession(headers, config); throw new ApiError(401, 'AUTH_REQUIRED', 'Please sign in again.'); }
      try { await authorize(config, data.session.access_token); }
      catch (error) { clearSession(headers, config); throw error; }
      setSession(headers, data.session, config);
      return reply({ refreshed: true });
    }

    const actor = await authorize(config, readCookie(request, names.access));
    await rateLimit(config, `user:${actor.id}`, 120, 60);
    if (path === '/api/v1/auth/session' && request.method === 'GET') return reply({ user: { id: actor.id } });
    if (path === '/api/v1/usage/ai' && request.method === 'GET') {
      const budget = dataOrThrow(await adminDatabase(config).rpc('ai_budget_status'));
      return reply({ mode: config.aiMode, userDailyLimit: config.aiDailyLimit, projectDailyLimit: config.aiGlobalDailyLimit, projectLifetimeAttempts: budget, unit: 'attempts-not-dollars' });
    }
    if (path === '/api/v1/auth/logout' && request.method === 'POST') {
      const input = parse(z.object({ allDevices: z.boolean().default(false) }).strict(), await body());
      const { error } = await adminDatabase(config).auth.admin.signOut(actor.token, input.allDevices ? 'global' : 'local');
      if (error) throw new ApiError(503, 'LOGOUT_FAILED', 'Could not confirm the remote sign-out. Try again.');
      clearSession(headers, config);
      return reply({ loggedOut: true, allDevices: input.allDevices });
    }

    if (path === '/api/v1/entries' || (path === '/api/v1/entries/search' && request.method === 'POST')) {
      if (request.method === 'GET' || path === '/api/v1/entries/search') {
        // Search text travels in a JSON body, never in provider access-log URLs.
        const search = path.endsWith('/search') ? parse(z.object({ q: z.string().max(120), limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).max(10000).default(0) }).strict(), await body()) : undefined;
        const limit = search?.limit ?? parse(z.coerce.number().int().min(1).max(100), url.searchParams.get('limit') ?? 50);
        const offset = search?.offset ?? parse(z.coerce.number().int().min(0).max(10000), url.searchParams.get('offset') ?? 0);
        const q = search?.q ?? '';
        let query = actor.db.from('entries').select('*').eq('user_id', actor.id).order('created_at', { ascending: false }).order('id').range(offset, offset + limit - 1);
        if (q) query = query.ilike('text', `%${q.replace(/[\\%_]/g, '\\$&')}%`);
        return reply({ entries: (dataOrThrow(await query) as EntryRow[]).map(entryView), limit, offset });
      }
      if (request.method === 'POST') {
        const input = parse(entryCreateSchema, await body());
        const row = dataOrThrow(await actor.db.from('entries').insert({ text: input.text, available_for_analysis: input.availableForAnalysis }).select('*').single()) as EntryRow;
        return reply({ entry: entryView(row) }, 201);
      }
    }
    const deletionMatch = path.match(/^\/api\/v1\/entries\/([^/]+)\/deletion-plan$/);
    if (deletionMatch && request.method === 'GET') {
      const id = parse(uuid, deletionMatch[1]);
      await sources(actor, [id]);
      const [profile, links, interpretations] = await Promise.all([
        allRows(actor.db, 'profile_items', actor.id),
        allRows(actor.db, 'profile_item_sources', actor.id, ['profile_item_id', 'entry_id']),
        allRows(actor.db, 'interpretations', actor.id),
      ]);
      const affected = new Set(links.filter(item => item.entry_id === id).map(item => String(item.profile_item_id)));
      let previousSize = -1;
      while (previousSize !== affected.size) {
        previousSize = affected.size;
        for (const item of profile) if ((item.context_profile_ids as string[]).some(source => affected.has(source))) affected.add(String(item.id));
      }
      return reply({ entryId: id, profileItems: profile.filter(item => affected.has(String(item.id))), interpretationIds: interpretations.filter(item => item.entry_id === id || (item.context_profile_ids as string[]).some(source => affected.has(source))).map(item => item.id), includesConversations: true, policy: 'cascade-or-cancel', snapshot: true });
    }
    const entryMatch = path.match(/^\/api\/v1\/entries\/([^/]+)$/);
    if (entryMatch) {
      const id = parse(uuid, entryMatch[1]);
      if (request.method === 'GET') return reply({ entry: entryView((await sources(actor, [id]))[0]) });
      if (request.method === 'PATCH') {
        const input = parse(entryPatchSchema, await body());
        const patch: Record<string, unknown> = {};
        if (input.text !== undefined) patch.text = input.text;
        if (input.availableForAnalysis !== undefined) patch.available_for_analysis = input.availableForAnalysis;
        const result = await actor.db.from('entries').update(patch).eq('id', id).eq('user_id', actor.id).eq('version', input.expectedVersion).select('*').maybeSingle();
        if (!result.error && !result.data) throw new ApiError(409, 'VERSION_CONFLICT', 'The entry changed or is no longer available.');
        return reply({ entry: entryView(dataOrThrow(result) as EntryRow) });
      }
      if (request.method === 'DELETE') {
        parse(z.object({ confirmCascade: z.literal(true) }).strict(), await body());
        const removed = dataOrThrow(await actor.db.rpc('delete_entry', { p_entry_id: id }));
        if (!removed) throw new ApiError(404, 'NOT_FOUND', 'The entry was not found.');
        return reply({ deleted: true, includes: ['interpretations', 'dependentProfileItems', 'conversations'] });
      }
    }

    if (path === '/api/v1/consents') {
      if (request.method === 'GET') return reply(consentView(await preferences(actor)));
      if (request.method === 'PATCH') {
        const input = parse(consentsSchema, await body());
        await preferences(actor);
        const result = await actor.db.from('account_preferences').update({ ai_enabled: input.aiEnabled, conversation: input.conversation, patterns: input.patterns, profile_memory: input.profileMemory }).eq('user_id', actor.id).eq('authorization_revision', input.expectedRevision).select('*').maybeSingle();
        if (!result.error && !result.data) throw new ApiError(409, 'VERSION_CONFLICT', 'Your permissions changed. Reload them before continuing.');
        return reply(consentView(dataOrThrow(result) as PreferenceRow));
      }
    }
    if (path === '/api/v1/settings') {
      if (request.method === 'GET') return reply({ settings: (await preferences(actor)).settings });
      if (request.method === 'PATCH') {
        const input = parse(settingsPatchSchema, await body());
        await preferences(actor);
        const result = await actor.db.from('account_preferences').update({ settings: input.settings }).eq('user_id', actor.id).eq('settings->>settingsRevision', String(input.expectedRevision)).select('*').maybeSingle();
        if (!result.error && !result.data) throw new ApiError(409, 'VERSION_CONFLICT', 'Your preferences changed. Reload them before continuing.');
        return reply({ settings: (dataOrThrow(result) as PreferenceRow).settings });
      }
    }
    if (path === '/api/v1/settings/preview' && request.method === 'POST') {
      const { settings } = parse(z.object({ settings: settingsSchema }).strict(), await body());
      const preview = await generateAI({ operation: 'accompany', entries: [], profileItems: [], settings: { ...settings, settingsRevision: 0 } }, { mode: 'mock' });
      return reply({ ...preview, settings, persisted: false });
    }

    if (path === '/api/v1/interface-settings') {
      if (request.method === 'GET') {
        const stored = interfaceSettingsSchema.safeParse((await preferences(actor)).interface_settings);
        return reply({ settings: stored.success ? stored.data : interfaceSettingsSchema.parse({}) });
      }
      if (request.method === 'PATCH') {
        const settings = parse(interfaceSettingsSchema, await body());
        await preferences(actor);
        dataOrThrow(await actor.db.from('account_preferences').update({ interface_settings: settings }).eq('user_id', actor.id).select('user_id').single());
        return reply({ settings });
      }
    }
    if (path === '/api/v1/profile') {
      if (request.method === 'GET') {
        const offset = parse(z.coerce.number().int().min(0).max(10000), url.searchParams.get('offset') ?? 0);
        return reply({ items: dataOrThrow(await actor.db.from('profile_items').select('*,profile_item_sources(entry_id,entry_version)').eq('user_id', actor.id).order('created_at').order('id').range(offset, offset + 99)), limit: 100, offset });
      }
      if (request.method === 'POST') return reply({ item: dataOrThrow(await actor.db.from('profile_items').insert(parse(profileSchema, await body())).select('*').single()) }, 201);
    }
    const profileMatch = path.match(/^\/api\/v1\/profile\/([^/]+)$/);
    if (profileMatch) {
      const id = parse(uuid, profileMatch[1]);
      if (request.method === 'PATCH') return reply({ item: dataOrThrow(await actor.db.from('profile_items').update(parse(profileSchema, await body())).eq('id', id).eq('user_id', actor.id).select('*').maybeSingle()) });
      if (request.method === 'DELETE') {
        parse(emptyObject, await body());
        dataOrThrow(await actor.db.from('profile_items').delete().eq('id', id).eq('user_id', actor.id).select('id').maybeSingle());
        return reply({ deleted: true });
      }
    }
    const decisionMatch = path.match(/^\/api\/v1\/suggestions\/([^/]+)\/decision$/);
    if (decisionMatch && request.method === 'POST') {
      const input = parse(decisionSchema, await body());
      const result = await actor.db.rpc('decide_profile_item', { p_id: parse(uuid, decisionMatch[1]), p_decision: input.decision, p_text: input.text ?? null });
      if (result.error) dataOrThrow(result);
      return reply({ updated: true });
    }
    if (path === '/api/v1/conversations' && request.method === 'POST') {
      const input = parse(conversationSchema, await body());
      await sources(actor, [input.entryId]);
      return reply({ conversation: dataOrThrow(await actor.db.from('conversations').insert({ entry_id: input.entryId }).select('id,entry_id,safety_state').single()) }, 201);
    }
    const pauseMatch = path.match(/^\/api\/v1\/conversations\/([^/]+)\/pause$/);
    if (pauseMatch && request.method === 'POST') {
      parse(emptyObject, await body());
      dataOrThrow(await actor.db.from('conversations').update({ safety_state: 'paused' }).eq('id', parse(uuid, pauseMatch[1])).eq('user_id', actor.id).select('id').maybeSingle());
      return reply({ paused: true, specialistProtocol: 'pending' });
    }

    if (path === '/api/v1/ai/operations' && request.method === 'POST') {
      const input = parse(aiSchema, await body());
      const pref = await preferences(actor);
      const rows = await sources(actor, input.entryIds);
      checkPermission(pref, input.operation, rows);
      await checkConversation(actor, input.conversationId, input.operation === 'pattern' ? undefined : rows[0].id);
      let previousResponse: AIContent | undefined;
      let previousUserTurn: string | undefined;
      let previousProfileVersions: Record<string, string> = {};
      if (input.previousReceipt && input.action !== 'change-topic') {
        const previous = parse(receiptSchema, openReceipt(input.previousReceipt, config.secret));
        if (previous.conversationId !== input.conversationId || previous.sources.length !== input.entryIds.length || previous.sources.some(source => !input.entryIds.includes(source.entryId))) throw new ApiError(409, 'CONVERSATION_MISMATCH', 'The previous context belongs to another conversation or source.');
        await revalidateReceipt(actor, previous);
        previousResponse = validateContent(previous.content, previous.operation, pref.settings);
        previousUserTurn = previous.lastUserTurn;
        previousProfileVersions = previous.profileVersions;
      }
      if (config.aiMode === 'disabled') throw new ApiError(503, 'AI_DISABLED', 'AI is not enabled. Your journal is still available.');
      if (config.aiMode === 'openai' && (!config.aiKey || config.aiModel !== 'gpt-5.4-mini')) throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI is not configured yet. Your journal is still available.');
      const profile = pref.profile_memory ? dataOrThrow(await actor.db.from('profile_items').select('id,text,category,updated_at').eq('user_id', actor.id).eq('status', 'accepted').order('updated_at', { ascending: false }).limit(10)) : [];
      const profileVersions: Record<string, string> = { ...Object.fromEntries(profile.map(item => [item.id, item.updated_at as string])), ...previousProfileVersions };
      if (Object.keys(profileVersions).length > 20) throw new ApiError(409, 'CONTEXT_LIMIT', 'Start a new context to continue with less information.');
      await rateLimit(config, `ai:user:${actor.id}`, config.aiDailyLimit, 86400);
      await rateLimit(config, 'ai:global', config.aiGlobalDailyLimit, 86400);
      if (config.aiMode === 'openai') {
        const reserved = dataOrThrow(await adminDatabase(config).rpc('reserve_ai_call'));
        if (!reserved) throw new ApiError(429, 'BUDGET_LIMIT', 'The challenge’s initial AI usage limit was reached. Your journal is still available.');
      }
      const effectiveSettings = { ...pref.settings, listenOnly: input.action === 'listen' || pref.settings.listenOnly };
      let generated: { content: AIContent; simulation: boolean };
      try { generated = await generateAI({ operation: input.operation, entries: rows.map(row => ({ id: row.id, version: row.version, text: row.text })), settings: effectiveSettings, profileItems: profile, turnText: input.turnText, previousResponse, previousUserTurn, context: input.context, action: input.action }, { mode: config.aiMode, apiKey: config.aiKey, model: config.aiModel }); }
      catch { throw new ApiError(503, 'AI_UNAVAILABLE', 'The AI could not provide a valid response. Your entry is kept; you can continue without AI.'); }
      if (generated.content.type === 'pattern') {
        const rejected = await actor.db.from('rejected_patterns').select('pattern_key').eq('user_id', actor.id).eq('pattern_key', generated.content.patternKey).maybeSingle();
        if (rejected.error) dataOrThrow(rejected);
        if (rejected.data) throw new ApiError(409, 'PATTERN_REJECTED', 'A suggestion you had already rejected was discarded.');
      }
      const receipt = { userId: actor.id, expiresAt: Date.now() + 15 * 60 * 1000, operation: input.operation, sources: rows.map(row => ({ entryId: row.id, entryVersion: row.version })), authorizationRevision: pref.authorization_revision, settingsRevision: pref.settings.settingsRevision, conversationId: input.conversationId, profileItemIds: Object.keys(profileVersions), profileVersions, content: generated.content, simulation: generated.simulation, lastUserTurn: input.turnText };
      await revalidateReceipt(actor, receipt);
      await authorize(config, actor.token);
      return reply({ schemaVersion: '0.1', requestId, simulation: generated.simulation, content: generated.content, context: { sources: receipt.sources, profileItemIds: receipt.profileItemIds }, receipt: sealReceipt(receipt, config.secret), expiresAt: receipt.expiresAt });
    }

    if ((path === '/api/v1/interpretations' || path === '/api/v1/suggestions') && request.method === 'POST') {
      const input = parse(receiptBodySchema, await body());
      const receipt = parse(receiptSchema, openReceipt(input.receipt, config.secret));
      const pref = await revalidateReceipt(actor, receipt);
      const content = validateContent(receipt.content, receipt.operation, pref.settings);
      const common = { p_user_id: actor.id, p_session_id: actor.sessionId, p_authorization_revision: receipt.authorizationRevision, p_settings_revision: receipt.settingsRevision, p_profile_item_ids: receipt.profileItemIds, p_profile_versions: receipt.profileVersions };
      if (path === '/api/v1/suggestions') {
        if (content.type !== 'pattern') throw new ApiError(422, 'WRONG_OPERATION', 'This response is not a pattern suggestion.');
        const id = dataOrThrow(await adminDatabase(config).rpc('save_pattern_proposal', { ...common, p_conversation_id: receipt.conversationId, p_simulation: receipt.simulation, p_sources: receipt.sources, p_category: content.category, p_text: content.hypothesis, p_pattern_key: content.patternKey }));
        return reply({ id, status: 'pending', simulation: receipt.simulation }, 201);
      }
      if (content.type === 'pattern') throw new ApiError(422, 'WRONG_OPERATION', 'Save the pattern as a suggestion before accepting it.');
      const id = dataOrThrow(await adminDatabase(config).rpc('save_ai_interpretation', { ...common, p_entry_id: receipt.sources[0].entryId, p_entry_version: receipt.sources[0].entryVersion, p_type: receipt.operation, p_content: content, p_simulation: receipt.simulation, p_conversation_id: receipt.conversationId }));
      return reply({ id, generatedBy: receipt.simulation ? 'simulation' : 'ai' }, 201);
    }
    if (path === '/api/v1/interpretations' && request.method === 'GET') {
      const entryId = parse(uuid, url.searchParams.get('entryId'));
      const offset = parse(z.coerce.number().int().min(0).max(10000), url.searchParams.get('offset') ?? 0);
      const current = (await sources(actor, [entryId]))[0];
      const items = dataOrThrow(await actor.db.from('interpretations').select('*').eq('user_id', actor.id).eq('entry_id', entryId).order('created_at').order('id').range(offset, offset + 99));
      return reply({ interpretations: items.map(item => ({ ...item, basedOnPreviousVersion: item.entry_version !== current.version })), limit: 100, offset });
    }
    const feedbackMatch = path.match(/^\/api\/v1\/interpretations\/([^/]+)\/readings\/([0-9]+)$/);
    if (feedbackMatch && request.method === 'PATCH') {
      const input = parse(z.object({ fits: z.boolean() }).strict(), await body());
      const result = dataOrThrow(await actor.db.rpc('set_reading_feedback', { p_id: parse(uuid, feedbackMatch[1]), p_index: parse(z.coerce.number().int().min(0).max(7), feedbackMatch[2]), p_fits: input.fits }));
      return reply({ interpretation: result });
    }
    if (path === '/api/v1/safety/status' && request.method === 'GET') {
      const activations = dataOrThrow(await actor.db.rpc('own_safety_activation_count'));
      return reply({ activations, specialistProtocol: 'pending', automaticDetection: false });
    }
    const interpretationMatch = path.match(/^\/api\/v1\/interpretations\/([^/]+)$/);
    if (interpretationMatch && request.method === 'DELETE') {
      parse(emptyObject, await body());
      dataOrThrow(await actor.db.from('interpretations').delete().eq('id', parse(uuid, interpretationMatch[1])).eq('user_id', actor.id).select('id').maybeSingle());
      return reply({ deleted: true });
    }

    if (path === '/api/v1/export' && request.method === 'GET') {
      await rateLimit(config, `export:${actor.id}`, 3, 3600);
      const [entries, interpretations, profile, conversations, prefs, rejected, links, safetyActivations] = await Promise.all([
        ...['entries', 'interpretations', 'profile_items', 'conversations'].map(table => allRows(actor.db, table, actor.id)),
        preferences(actor),
        allRows(actor.db, 'rejected_patterns', actor.id, ['pattern_key']),
        allRows(actor.db, 'profile_item_sources', actor.id, ['profile_item_id', 'entry_id']),
        actor.db.rpc('own_safety_activation_count').then(dataOrThrow),
      ]);
      headers.set('Content-Type', 'text/plain; charset=utf-8'); headers.set('Content-Disposition', 'attachment; filename="my-grandaptive-data.txt"');
      const text = `PERSONAL EXPORT\nGenerated: ${new Date().toISOString()}\nDoes not include passwords, tokens, browser drafts, or unsaved conversations.\n\n${JSON.stringify({ entries, interpretations, profile, conversations, preferences: prefs, rejectedPatterns: rejected, profileSources: links, safetyActivations }, null, 2)}`;
      return new Response(text, { headers });
    }
    if (path === '/api/v1/account' && request.method === 'DELETE') {
      parse(z.object({ confirmation: z.enum(['DELETE MY ACCOUNT', 'ELIMINAR MI CUENTA']) }).strict(), await body());
      const { error } = await adminDatabase(config).auth.admin.deleteUser(actor.id);
      if (error) throw new ApiError(503, 'DELETE_FAILED', 'Could not confirm the deletion. Try again.');
      clearSession(headers, config);
      return reply({ deletedFromActiveDatabase: true, backupRetention: 'provider-policy-pending', localDrafts: 'clear-in-frontend' });
    }
    throw new ApiError(404, 'NOT_FOUND', 'This action was not found.');
  } catch (error) {
    const known = error instanceof ApiError;
    const status = known ? error.status : 500;
    if (status === 429) headers.set('Retry-After', '60');
    return reply({ error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'The action could not be completed. Try again.', requestId } }, status);
  }
}
