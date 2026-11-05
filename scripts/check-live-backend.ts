import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readConfig } from '../server/security.ts';

// Explicit opt-in: creates two synthetic Auth users and deletes only those users in finally.
// Never sends email, uses OpenAI, disables CAPTCHA, prints tokens or reads existing user content.
if (!process.argv.includes('--confirm-synthetic-users')) {
  console.error('Requiere --confirm-synthetic-users: crea dos cuentas efímeras y datos ficticios y los elimina al terminar.');
  process.exit(1);
}
const config = readConfig();
const database = new URL(config.supabaseUrl);
if (database.protocol !== 'https:' || !database.hostname.endsWith('.supabase.co') || database.pathname !== '/' || database.port || database.search || database.hash) {
  throw new Error('Destino Supabase no válido para esta prueba.');
}
const origin = 'https://grandaptive.vercel.app';
const run = randomUUID();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: ((input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) })) as typeof fetch } };
const admin = createClient(database.origin, config.serviceKey, options);
const created: { id: string; client: SupabaseClient; token: string }[] = [];
const cleanupIds = new Set<string>();
let stage = 'preflight';
let failures = false;
class CheckFailure extends Error {}
function ensure(condition: unknown, label: string): asserts condition {
  if (!condition) throw new CheckFailure(label);
}
function passed(label: string) { console.log(`PASS ${label}`); }
async function api(token: string, path: string, method = 'GET', body?: unknown, expected = 200) {
  const response = await fetch(`${origin}/api/v1/${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Cookie: `__Host-ga_access=${token}`, Origin: origin, 'X-Requested-With': 'grandaptive', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  ensure(response.status === expected, `${method} ${path.split('/')[0]}: HTTP ${response.status}, esperado ${expected}`);
  return response;
}
try {
  const schema = await admin.rpc('backend_readiness');
  ensure(!schema.error && schema.data === 2, 'Se requiere migración 002 y clave de servidor válida.');
  for (const suffix of ['a', 'b']) {
    stage = `crear cuenta sintética ${suffix}`;
    const email = `grandaptive-test-${run}-${suffix}@example.com`;
    const password = randomBytes(32).toString('hex');
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { challenge_member: true, synthetic_test_run: run } });
    ensure(!result.error && result.data.user, 'No se pudo crear la cuenta sintética.');
    cleanupIds.add(result.data.user.id);
    const client = createClient(database.origin, config.anonKey, options);
    stage = `sesión Auth sintética ${suffix}`;
    const login = await client.auth.signInWithPassword({ email, password });
    ensure(!login.error && login.data.session, 'Auth no emitió sesión; si CAPTCHA está activo, usar prueba interactiva. No desactivarlo.');
    created.push({ id: result.data.user.id, client, token: login.data.session.access_token });
  }
  const [a, b] = created;
  stage = 'sesiones reales y membresía';
  ensure((await (await api(a.token, 'auth/session')).json()).user.id === a.id, 'Sesión A incorrecta.');
  ensure((await (await api(b.token, 'auth/session')).json()).user.id === b.id, 'Sesión B incorrecta.');
  passed(stage);

  stage = 'diario sin IA y aislamiento';
  const saved = await (await api(a.token, 'entries', 'POST', { text: 'Registro sintético de integración. Sin información personal.' }, 201)).json();
  const entryId = saved.entry.id as string;
  await api(b.token, `entries/${entryId}`, 'GET', undefined, 404);
  await api(b.token, `entries/${entryId}`, 'PATCH', { expectedVersion: 1, text: 'Cambio no autorizado.' }, 409);
  await api(b.token, `entries/${entryId}`, 'DELETE', { confirmCascade: true }, 404);
  const cross = await b.client.from('entries').select('id').eq('id', entryId);
  ensure(!cross.error && cross.data?.length === 0, 'REST expuso entrada ajena.');
  const crossWrite = await b.client.from('entries').update({ text: 'Cambio no autorizado.' }).eq('id', entryId).select('id');
  ensure(crossWrite.error || crossWrite.data?.length === 0, 'REST modificó entrada ajena.');
  const own = await (await api(a.token, `entries/${entryId}`)).json();
  ensure(own.entry.text === saved.entry.text, 'Entrada alterada desde cuenta B.');
  const edited = await (await api(a.token, `entries/${entryId}`, 'PATCH', { expectedVersion: 1, text: 'Registro sintético corregido.' })).json();
  ensure(edited.entry.version === 2, 'Versión no incrementada.');
  await api(a.token, `entries/${entryId}`, 'PATCH', { expectedVersion: 1, text: 'Escritura obsoleta.' }, 409);
  passed(stage);

  stage = 'consentimientos y preferencias';
  const consents = await (await api(a.token, 'consents')).json();
  ensure(!consents.aiEnabled && !consents.profileMemory, 'Consentimientos iniciales inesperados.');
  const enabled = await (await api(a.token, 'consents', 'PATCH', { expectedRevision: consents.authorizationRevision, aiEnabled: true, conversation: true, patterns: false, profileMemory: false })).json();
  ensure(enabled.authorizationRevision > consents.authorizationRevision && !enabled.patterns, 'Capas/revisión incorrectas.');
  await api(a.token, 'consents', 'PATCH', { expectedRevision: enabled.authorizationRevision, aiEnabled: false, conversation: false, patterns: false, profileMemory: false });
  const settings = (await (await api(a.token, 'settings')).json()).settings;
  const { settingsRevision, ...values } = settings;
  const changed = await (await api(a.token, 'settings', 'PATCH', { expectedRevision: settingsRevision, settings: { ...values, questionStyle: 'open' } })).json();
  ensure(changed.settings.questionStyle === 'open', 'Preferencia no persistió.');
  const preview = await (await api(a.token, 'settings/preview', 'POST', { settings: { ...values, tone: 'warm' } })).json();
  ensure(preview.simulation && preview.persisted === false, 'Vista previa no simulada.');
  const afterPreview = (await (await api(a.token, 'settings')).json()).settings;
  ensure(afterPreview.settingsRevision === changed.settings.settingsRevision, 'Vista previa modificó preferencias.');
  passed(stage);

  stage = 'perfil y pausa persistente';
  const item = (await (await api(a.token, 'profile', 'POST', { category: 'sensory', text: 'Preferencia ficticia de prueba.' }, 201)).json()).item;
  await api(b.token, `profile/${item.id}`, 'PATCH', { category: 'sensory', text: 'Cambio ajeno.' }, 404);
  const conversation = (await (await api(a.token, 'conversations', 'POST', { entryId }, 201)).json()).conversation;
  await api(a.token, `conversations/${conversation.id}/pause`, 'POST', {});
  await api(a.token, `conversations/${conversation.id}/pause`, 'POST', {});
  const safety = await (await api(a.token, 'safety/status')).json();
  ensure(safety.activations === 1 && safety.automaticDetection === false, 'Conteo de pausas incorrecto.');
  passed(stage);

  stage = 'exportación, borrado y cascada de conversación';
  const exported = await (await api(a.token, 'export')).text();
  ensure(exported.includes(entryId) && exported.includes(item.id) && !exported.includes(a.token), 'Exportación incompleta o con token.');
  await api(a.token, `entries/${entryId}/deletion-plan`);
  await api(a.token, `entries/${entryId}`, 'DELETE', { confirmCascade: true });
  await api(a.token, `entries/${entryId}`, 'GET', undefined, 404);
  const removed = await a.client.from('conversations').select('id').eq('id', conversation.id);
  ensure(!removed.error && removed.data?.length === 0, 'No se eliminó conversación derivada.');
  passed(stage);

  stage = 'revocación y eliminación de cuenta';
  await api(b.token, 'auth/logout', 'POST', { allDevices: true });
  await api(b.token, 'auth/session', 'GET', undefined, 401);
  const revoked = await b.client.rpc('assert_live_session');
  ensure(revoked.error || revoked.data !== true, 'Sesión revocada sigue activa en SQL.');
  const deletion = await (await api(a.token, 'account', 'DELETE', { confirmation: 'ELIMINAR MI CUENTA' })).json();
  ensure(deletion.deletedFromActiveDatabase === true, 'Cuenta no eliminada.');
  const exists = await admin.auth.admin.getUserById(a.id);
  ensure(exists.error?.status === 404 || (!exists.error && !exists.data.user), 'No se confirmó ausencia de cuenta A.');
  cleanupIds.delete(a.id);
  await api(a.token, 'auth/session', 'GET', undefined, 401);
  const profileAfter = await admin.from('profile_items').select('id').eq('id', item.id).eq('user_id', a.id);
  ensure(!profileAfter.error && profileAfter.data?.length === 0, 'Perfil no eliminado con la cuenta.');
  passed(stage);
} catch (error) {
  failures = true;
  // Only messages created by this script; never serialize provider exceptions.
  const safe = error instanceof CheckFailure ? error.message : 'Fallo de conexión o proveedor sin detalles sensibles.';
  console.error(`FAIL ${stage}: ${safe}`);
} finally {
  for (const id of cleanupIds) {
    try {
    const user = await admin.auth.admin.getUserById(id);
    if (user.error?.status === 404) continue;
    if (user.error || user.data.user?.app_metadata.synthetic_test_run !== run) {
      failures = true; console.error(`PENDING limpieza de usuario sintético ${id}: no se pudo confirmar pertenencia a esta ejecución.`); continue;
    }
    const result = await admin.auth.admin.deleteUser(id);
    if (result.error) { failures = true; console.error(`PENDING limpieza de usuario sintético ${id}.`); }
    else console.log('PASS limpieza de cuenta sintética y datos asociados');
    } catch {
      failures = true; console.error(`PENDING limpieza de usuario sintético ${id}: conexión no disponible.`);
    }
  }
  console.log('Límite: sesiones obtenidas directamente de Auth. No valida formulario/CAPTCHA/login BFF, cookies del navegador, interpretaciones IA ni todas las cascadas. No se llamó a OpenAI.');
  process.exitCode = failures ? 1 : 0;
}
