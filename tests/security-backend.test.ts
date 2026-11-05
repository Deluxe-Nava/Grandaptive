import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '@supabase/supabase-js';
import {
  ApiError, clearSession, cookieNames, guardRequest, openReceipt, parse,
  privateRateKey, readConfig, readCookie, readJson, sealReceipt, secureHeaders, setSession,
} from '../server/security.ts';
import { aiSchema, entryCreateSchema, entryPatchSchema, loginSchema, profileSchema } from '../server/schemas.ts';

const origin = 'https://challenge.example';
const secret = 'a1'.repeat(32);
const code = (expected: string) => (error: unknown) => error instanceof ApiError && error.code === expected;

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    APP_ORIGIN: origin, SUPABASE_URL: 'https://database.example',
    SUPABASE_ANON_KEY: 'test-anon-not-a-real-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-not-a-real-key', SERVER_SECRET: secret,
    NODE_ENV: 'production', ...extra,
  };
}

function request(headers: Record<string, string> = {}, method = 'POST') {
  return new Request(`${origin}/api/v1/entries`, { method, headers });
}

test('mutaciones requieren origen exacto y cabecera propia; lectura same-origin no inventa un permiso', () => {
  assert.doesNotThrow(() => guardRequest(request({ origin, 'x-requested-with': 'grandaptive', 'sec-fetch-site': 'same-origin' }), origin));
  assert.doesNotThrow(() => guardRequest(request({}, 'GET'), origin));
  assert.throws(() => guardRequest(request({ origin: `${origin}.attacker.example`, 'x-requested-with': 'grandaptive' }), origin), code('ORIGIN_REJECTED'));
  assert.throws(() => guardRequest(request({ origin: 'null', 'x-requested-with': 'grandaptive' }), origin), code('ORIGIN_REJECTED'));
  assert.throws(() => guardRequest(request({ 'x-requested-with': 'grandaptive' }), origin), code('ORIGIN_REQUIRED'));
  assert.throws(() => guardRequest(request({ origin }), origin), code('CSRF_REJECTED'));
  assert.throws(() => guardRequest(request({ origin, 'x-requested-with': 'another-client' }), origin), code('CSRF_REJECTED'));
});

test('se rechaza fetch cross-site incluso si el origen suministrado parece correcto', () => {
  assert.throws(() => guardRequest(request({ origin, 'x-requested-with': 'grandaptive', 'sec-fetch-site': 'cross-site' }), origin), code('CROSS_SITE_REJECTED'));
  assert.throws(() => guardRequest(request({ origin: 'https://foreign.example' }, 'GET'), origin), code('ORIGIN_REJECTED'));
});

test('JSON acepta UTF-8 y rechaza tipos simples o formato inválido sin revelar su contenido', async () => {
  const good = new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"text":"día ficticio"}' });
  assert.deepEqual(await readJson(good), { text: 'día ficticio' });
  await assert.rejects(readJson(new Request(origin, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })), code('JSON_REQUIRED'));
  await assert.rejects(readJson(new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{private-text' })), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_JSON' && !error.message.includes('private-text'));
  await assert.rejects(readJson(request({ 'content-type': 'application/json' })), code('INVALID_JSON'));
});

test('límite de cuerpo no confía en Content-Length y cancela un stream demasiado grande', async () => {
  let canceled = false;
  let sent = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent) { sent = true; controller.enqueue(new TextEncoder().encode('a'.repeat(32769))); }
    },
    cancel() { canceled = true; },
  });
  const req = new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1' }, body: stream, duplex: 'half' } as RequestInit & { duplex: 'half' });
  await assert.rejects(readJson(req), code('BODY_TOO_LARGE'));
  assert.equal(canceled, true);
  await assert.rejects(readJson(new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '32769' }, body: '{}' })), code('BODY_TOO_LARGE'));
});

test('límite de cuerpo cuenta bytes UTF-8, no sólo caracteres', async () => {
  const req = new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'á'.repeat(17000) }) });
  await assert.rejects(readJson(req), code('BODY_TOO_LARGE'));
});

test('cookies producción: __Host, Secure, HttpOnly, SameSite, Path=/ y sin Domain', () => {
  const headers = new Headers();
  const session = { access_token: 'access-secret', refresh_token: 'refresh-secret', expires_in: 7200 } as Session;
  setSession(headers, session, readConfig(env()));
  const cookies = headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.match(cookies[0]!, /^__Host-ga_access=/);
  assert.match(cookies[1]!, /^__Host-ga_refresh=/);
  for (const value of cookies) {
    assert.match(value, /; HttpOnly/);
    assert.match(value, /; Secure/);
    assert.match(value, /; SameSite=Lax/);
    assert.match(value, /; Path=\//);
    assert.doesNotMatch(value, /Domain=/i);
  }
  assert.match(cookies[0]!, /Max-Age=3600/);
  assert.match(cookies[1]!, /Max-Age=28800/);
});

test('cookies localhost no llevan prefijo __Host ni Secure; borrado elimina ambas cookies', () => {
  const config = readConfig(env({ NODE_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:3001' }));
  const headers = new Headers();
  setSession(headers, { access_token: 'a', refresh_token: 'r', expires_in: 300 } as Session, config);
  assert.deepEqual(cookieNames(false), { access: 'ga_access', refresh: 'ga_refresh' });
  for (const value of headers.getSetCookie()) { assert.doesNotMatch(value, /__Host-|; Secure/); assert.match(value, /HttpOnly/); }
  const cleared = new Headers();
  clearSession(cleared, readConfig(env()));
  assert.equal(cleared.getSetCookie().length, 2);
  for (const value of cleared.getSetCookie()) { assert.match(value, /Max-Age=0/); assert.match(value, /; Secure/); }
});

test('cookies duplicadas o codificación rota no producen una sesión elegida arbitrariamente', () => {
  assert.equal(readCookie(request({ cookie: 'other=1; ga_access=hello%20world' }), 'ga_access'), 'hello world');
  assert.equal(readCookie(request({ cookie: 'not_ga_access=a' }), 'ga_access'), undefined);
  assert.throws(() => readCookie(request({ cookie: 'ga_access=one; ga_access=two' }), 'ga_access'), code('INVALID_COOKIE'));
  assert.throws(() => readCookie(request({ cookie: 'ga_access=%ZZ' }), 'ga_access'), code('INVALID_COOKIE'));
});

test('recibos AES-GCM ocultan contenido, usan nonce distinto y detectan alteración o clave equivocada', () => {
  const payload = { userId: 'fictitious', text: 'contenido privado ficticio', expiresAt: 123 };
  const token = sealReceipt(payload, secret);
  const second = sealReceipt(payload, secret);
  assert.notEqual(token, second);
  assert.deepEqual(openReceipt(token, secret), payload);
  assert.ok(!Buffer.from(token, 'base64url').includes(Buffer.from(payload.text)));
  const tampered = Buffer.from(token, 'base64url'); tampered[tampered.length - 1]! ^= 1;
  assert.throws(() => openReceipt(tampered.toString('base64url'), secret), code('INVALID_RECEIPT'));
  assert.throws(() => openReceipt(token, 'b2'.repeat(32)), code('INVALID_RECEIPT'));
  assert.throws(() => openReceipt('short', secret), code('INVALID_RECEIPT'));
  assert.throws(() => openReceipt('a'.repeat(24001), secret), code('INVALID_RECEIPT'));
});

test('configuración ausente o insegura falla con mensaje que no expone valores secretos', () => {
  assert.throws(() => readConfig({}), code('BACKEND_NOT_CONFIGURED'));
  const fakeSecret = 'deliberately-invalid-private-value';
  assert.throws(() => readConfig(env({ SERVER_SECRET: fakeSecret })), (error: unknown) => error instanceof ApiError && error.status === 503 && !error.message.includes(fakeSecret));
  assert.throws(() => readConfig(env({ APP_ORIGIN: 'http://challenge.example' })), code('BACKEND_NOT_CONFIGURED'));
  assert.throws(() => readConfig(env({ APP_ORIGIN: 'https://challenge.example/path' })), code('BACKEND_NOT_CONFIGURED'));
  assert.throws(() => readConfig(env({ SUPABASE_URL: 'http://database.example' })), code('BACKEND_NOT_CONFIGURED'));
  assert.equal(readConfig(env({ AI_MODE: 'openai' })).aiMode, 'openai'); // Misconfigured AI must not disable the diary.
  const config = readConfig(env());
  assert.equal(config.aiMode, 'disabled');
  assert.equal(config.aiDailyLimit, 15);
});

test('cabeceras API impiden caché, sniffing y framing; HSTS sólo se envía en producción', () => {
  const headers = secureHeaders(true);
  assert.equal(headers.get('cache-control'), 'no-store, private');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.match(headers.get('content-security-policy')!, /default-src 'none'/);
  assert.match(headers.get('strict-transport-security')!, /max-age=/);
  assert.equal(secureHeaders(false).has('strict-transport-security'), false);
  assert.equal(headers.has('access-control-allow-origin'), false);
});

test('claves de limitación no contienen IP o correo y están ligadas al secreto', () => {
  const key = privateRateKey(secret, '203.0.113.2:person@example.test');
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, privateRateKey(secret, '203.0.113.2:person@example.test'));
  assert.notEqual(key, privateRateKey('b2'.repeat(32), '203.0.113.2:person@example.test'));
});

test('formularios estrictos rechazan asignar propietario, campos desconocidos y texto vacío', () => {
  assert.throws(() => parse(entryCreateSchema, { text: 'ficticio', ownerId: 'someone-else' }), code('INVALID_INPUT'));
  assert.throws(() => parse(entryCreateSchema, { text: ' \n\t ' }), code('INVALID_INPUT'));
  assert.throws(() => parse(entryCreateSchema, { text: 'a'.repeat(8001) }), code('INVALID_INPUT'));
  assert.throws(() => parse(entryPatchSchema, { expectedVersion: 1 }), code('INVALID_INPUT'));
  assert.throws(() => parse(entryPatchSchema, { expectedVersion: 0, text: 'ficticio' }), code('INVALID_INPUT'));
  assert.throws(() => parse(profileSchema, { category: 'sensory', text: '  ' }), code('INVALID_INPUT'));
  assert.throws(() => parse(profileSchema, { category: 'sensory', text: 'ruido', origin: 'ai' }), code('INVALID_INPUT'));
  assert.deepEqual(parse(entryCreateSchema, { text: '<script>ficticio</script>' }), { text: '<script>ficticio</script>', availableForAnalysis: false });
});

test('login requiere CAPTCHA y AI rechaza fuentes repetidas, desconocidas o cardinalidad incorrecta', () => {
  assert.throws(() => parse(loginSchema, { email: 'a@example.test', password: 'test-only' }), code('INVALID_INPUT'));
  assert.throws(() => parse(loginSchema, { email: 'invalid', password: 'test-only', captchaToken: 'ficticio' }), code('INVALID_INPUT'));
  const id = '00000000-0000-4000-8000-000000000001';
  const id2 = '00000000-0000-4000-8000-000000000002';
  assert.throws(() => parse(aiSchema, { operation: 'pattern', conversationId: id, entryIds: [id, id] }), code('INVALID_INPUT'));
  assert.throws(() => parse(aiSchema, { operation: 'summary', conversationId: id, entryIds: [id, id2] }), code('INVALID_INPUT'));
  assert.throws(() => parse(aiSchema, { operation: 'accompany', conversationId: id, entryIds: [id], ownerId: id2 }), code('INVALID_INPUT'));
});
