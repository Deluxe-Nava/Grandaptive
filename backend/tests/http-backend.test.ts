import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.ts';
import type { Config } from '../src/security.ts';
import { sealReceipt, openReceipt } from '../src/security.ts';

const config: Config = { origin: 'https://challenge.example', supabaseUrl: 'https://database.example', anonKey: 'synthetic-anon-key-only', serviceKey: 'synthetic-service-key-only', secret: 'a1'.repeat(32), production: true, aiMode: 'disabled', aiDailyLimit: 15, aiGlobalDailyLimit: 100, captchaConfigured: true };
const userId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const token = `synthetic.${Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId })).toString('base64url')}.synthetic`;
function request(path: string, body?: unknown, authenticated = false) {
  return new Request(`${config.origin}/api/v1/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: {
    Origin: config.origin, 'X-Requested-With': 'grandaptive', 'Content-Type': 'application/json',
    ...(authenticated ? { Cookie: `__Host-ga_access=${token}` } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
}

test('health funciona sin cuentas; datos privados requieren sesión y no filtran configuración', async () => {
  const health = await handleRequest(request('health'));
  assert.equal(health.status, 200);
  const response = await handleRequest(request('entries'), config);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'AUTH_REQUIRED');
  assert.equal(response.headers.get('cache-control'), 'no-store, private');
});

test('handler rechaza origen ajeno antes de consultar Auth o guardar', async context => {
  context.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network'); });
  const response = await handleRequest(new Request(`${config.origin}/api/v1/entries`, { method: 'POST', headers: { Origin: 'https://attacker.example' } }), config);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'ORIGIN_REJECTED');
});

test('ruta diario valida sesión y cuota, guarda sin llamar a OpenAI ni aceptar un propietario del cliente', async context => {
  let inserts = 0;
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: userId, app_metadata: { challenge_member: true } });
    if (url.includes('/rpc/assert_live_session')) return Response.json(true);
    if (url.includes('/rpc/consume_rate_limit')) return Response.json(true);
    if (url.includes('/rest/v1/entries') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body, { text: 'Registro sintético.', available_for_analysis: false });
      inserts++;
      return Response.json({ id: '30000000-0000-4000-8000-000000000001', user_id: userId, ...body, version: 1, created_at: '2026-11-04T00:00:00Z', updated_at: '2026-11-04T00:00:00Z' });
    }
    throw new Error(`Unexpected request: ${new URL(url).pathname}`);
  });
  const saved = await handleRequest(request('entries', { text: 'Registro sintético.' }, true), config);
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).entry.version, 1);
  const forged = await handleRequest(request('entries', { text: 'Registro sintético.', user_id: 'another-user' }, true), config);
  assert.equal(forged.status, 422);
  assert.equal(inserts, 1);
});

test('sesión revocada bloquea el handler antes de consultar el diario', async context => {
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    if (String(input).includes('/auth/v1/user')) return Response.json({ id: userId, app_metadata: { challenge_member: true } });
    if (String(input).includes('/rpc/assert_live_session')) return Response.json(false);
    throw new Error('Private query after revoked session');
  });
  const response = await handleRequest(request('entries', undefined, true), config);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'SESSION_REVOKED');
});

test('continuación exige recibo propio, fresco y de la misma conversación sin guardar el historial', async context => {
  const entryId = '30000000-0000-4000-8000-000000000001';
  const conversationId = '40000000-0000-4000-8000-000000000001';
  const pref = { ai_enabled: true, conversation: true, patterns: false, profile_memory: false, authorization_revision: 0, settings: { tone: 'neutral', length: 'brief', listenOnly: true, followUp: false, settingsRevision: 0 } };
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: userId, app_metadata: { challenge_member: true } });
    if (url.includes('/rpc/assert_live_session') || url.includes('/rpc/consume_rate_limit')) return Response.json(true);
    assert.equal(init?.method ?? 'GET', 'GET'); // No persistence of conversation turns.
    if (url.includes('/account_preferences')) return Response.json(pref);
    if (url.includes('/entries')) return Response.json([{ id: entryId, user_id: userId, text: 'Relato sintético.', version: 1, available_for_analysis: false }]);
    if (url.includes('/conversations')) return Response.json({ id: conversationId, entry_id: entryId, safety_state: 'normal' });
    throw new Error('Unexpected network');
  });
  const receipt = { userId, expiresAt: Date.now()+60000, operation: 'accompany', sources: [{ entryId, entryVersion: 1 }], authorizationRevision: 0, settingsRevision: 0, conversationId, profileItemIds: [], profileVersions: {}, content: { type: 'accompany', text: 'Registro conservado.', questions: [], recommendations: [] }, simulation: true, lastUserTurn: 'Anterior.' };
  const call = (previous: object) => handleRequest(request('ai/operations', { operation: 'accompany', entryIds: [entryId], conversationId, turnText: 'Ahora.', previousReceipt: sealReceipt(previous, config.secret) }, true), { ...config, aiMode: 'mock' });
  const own = await call(receipt);
  assert.equal(own.status, 200);
  const value = await own.json();
  assert.equal((openReceipt(value.receipt, config.secret) as {lastUserTurn:string}).lastUserTurn, 'Ahora.');
  assert.equal((await call({ ...receipt, userId: '10000000-0000-4000-8000-000000000002' })).status, 409);
  assert.equal((await call({ ...receipt, expiresAt: 0 })).status, 409);
  assert.equal((await call({ ...receipt, conversationId: '40000000-0000-4000-8000-000000000002' })).status, 409);
});

test('preview usa el contrato settings anidado, sin guardar preferencias ni contactar IA', async context => {
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/auth/v1/user')) return Response.json({ id: userId, app_metadata: { challenge_member: true } });
    if (url.includes('/rpc/assert_live_session') || url.includes('/rpc/consume_rate_limit')) return Response.json(true);
    throw new Error('Unexpected persistence or provider call');
  });
  const settings = { tone: 'warm', length: 'brief', listenOnly: true, followUp: false };
  const response = await handleRequest(request('settings/preview', { settings }, true), config);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.simulation, true);
  assert.equal(body.persisted, false);
  assert.deepEqual(body.content.questions, []);
  assert.equal((await handleRequest(request('settings/preview', settings, true), config)).status, 422);
});
