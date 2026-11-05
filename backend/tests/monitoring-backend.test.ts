import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.ts';
import { readConfig, type Config } from '../src/security.ts';
import { generateAI } from '../src/ai.ts';
import { settingsSchema } from '../src/schemas.ts';

const config: Config = { origin: 'https://challenge.example', supabaseUrl: 'https://database.example', anonKey: 'synthetic-anon-key-only', serviceKey: 'synthetic-service-key-only', secret: 'a1'.repeat(32), production: true, aiMode: 'disabled', aiDailyLimit: 15, aiGlobalDailyLimit: 100, captchaConfigured: true, monitorToken: 'synthetic-monitor-token-32-characters' };

test('health GET y HEAD no consultan base ni IA ni exigen credenciales', async context => {
  context.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network'); });
  for (const method of ['GET', 'HEAD']) {
    const response = await handleRequest(new Request('https://challenge.example/api/v1/health', { method }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-grandaptive-health'), 'live');
    if (method === 'HEAD') assert.equal(await response.text(), '');
    else assert.equal((await response.json()).scope, 'process');
  }
});

test('ready rechaza token ausente/incorrecto antes de usar Supabase', async context => {
  context.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network'); });
  for (const authorization of ['', 'Bearer wrong']) {
    const response = await handleRequest(new Request('https://challenge.example/api/v1/ready', { headers: { authorization } }), config);
    assert.equal(response.status, 401);
  }
});

test('ready consulta sólo RPC sin datos, no usa service role y falla cerrado con esquema antiguo', async context => {
  let readyVersion = 2;
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/backend_readiness');
    assert.equal(new Headers(init?.headers).get('apikey'), config.anonKey);
    return Response.json(readyVersion);
  });
  const make = (method = 'GET') => new Request('https://challenge.example/api/v1/ready', { method, headers: { authorization: `Bearer ${config.monitorToken}` } });
  assert.equal((await handleRequest(make(), config)).status, 200);
  const head = await handleRequest(make('HEAD'), config);
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  readyVersion = 1;
  const failure = await handleRequest(make(), config);
  assert.equal(failure.status, 503);
  assert.doesNotMatch(await failure.text(), /synthetic|service.role|database.example/);
});

test('OpenAI sin clave no bloquea lectura de configuración del diario', () => {
  const result = readConfig({ APP_ORIGIN: config.origin, SUPABASE_URL: config.supabaseUrl, SUPABASE_ANON_KEY: config.anonKey, SUPABASE_SERVICE_ROLE_KEY: config.serviceKey, SERVER_SECRET: config.secret, AI_MODE: 'openai' });
  assert.equal(result.aiMode, 'openai'); assert.equal(result.aiKey, undefined);
});

test('preferencias nuevas se validan y llegan al prompt como N1, fuera de datos no confiables', async () => {
  const settings = settingsSchema.parse({ tone: 'warm', length: 'brief', listenOnly: false, followUp: true, questionStyle: 'open', useExamples: true, literalLanguage: true, modality: 'text' });
  assert.equal(settingsSchema.safeParse({ ...settings, modality: 'voice' }).success, false);
  await generateAI({ operation: 'accompany', entries: [], profileItems: [], settings: { ...settings, settingsRevision: 0 } }, { mode: 'openai', apiKey: 'synthetic', model: 'gpt-5.4-mini' }, (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.match(body.instructions, /"questionStyle":"open"/);
    assert.match(body.instructions, /"useExamples":true/);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ type: 'accompany', text: 'Gracias por compartirlo.', questions: [], recommendations: [] }) }] }] });
  }) as typeof fetch);
});
