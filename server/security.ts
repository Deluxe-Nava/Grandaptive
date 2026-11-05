import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { Session } from '@supabase/supabase-js';
import { z } from 'zod';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export interface Config {
  origin: string;
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  secret: string;
  production: boolean;
  aiMode: 'disabled' | 'mock' | 'openai';
  aiKey?: string;
  aiModel?: string;
  aiDailyLimit: number;
  aiGlobalDailyLimit: number;
  captchaConfigured: boolean;
  monitorToken?: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.VERCEL === '1' || env.NODE_ENV === 'production';
  const schema = z.object({
    APP_ORIGIN: z.url(), SUPABASE_URL: z.url(), SUPABASE_ANON_KEY: z.string().min(20),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20), SERVER_SECRET: z.string().regex(/^[a-f0-9]{64}$/i),
    AI_MODE: z.enum(['disabled', 'mock', 'openai']).default('disabled'),
    AI_DAILY_LIMIT: z.coerce.number().int().min(1).max(100).default(15),
    AI_GLOBAL_DAILY_LIMIT: z.coerce.number().int().min(1).max(2000).default(100),
  });
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new ApiError(503, 'BACKEND_NOT_CONFIGURED', 'El backend todavía no está configurado.');
  const e = parsed.data;
  const origin = new URL(e.APP_ORIGIN);
  const database = new URL(e.SUPABASE_URL);
  if (origin.origin !== e.APP_ORIGIN || origin.username || origin.password || database.username || database.password ||
    (production && (origin.protocol !== 'https:' || database.protocol !== 'https:')) ||
    (!production && !['https:', 'http:'].includes(origin.protocol))) {
    throw new ApiError(503, 'BACKEND_NOT_CONFIGURED', 'Revisa la configuración del backend.');
  }
  return {
    origin: e.APP_ORIGIN, supabaseUrl: e.SUPABASE_URL, anonKey: e.SUPABASE_ANON_KEY,
    serviceKey: e.SUPABASE_SERVICE_ROLE_KEY, secret: e.SERVER_SECRET, production,
    aiMode: e.AI_MODE, aiKey: env.OPENAI_API_KEY, aiModel: env.OPENAI_MODEL,
    aiDailyLimit: e.AI_DAILY_LIMIT, aiGlobalDailyLimit: e.AI_GLOBAL_DAILY_LIMIT,
    captchaConfigured: env.AUTH_CAPTCHA_ENABLED === 'true',
    monitorToken: env.MONITOR_TOKEN,
  };
}

export function authorizeMonitor(request: Request, expected: string | undefined): void {
  if (!expected || expected.length < 32) throw new ApiError(503, 'MONITOR_NOT_CONFIGURED', 'Monitoreo de dependencias no configurado.');
  const supplied = request.headers.get('authorization') ?? '';
  const hash = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(hash(supplied), hash(`Bearer ${expected}`))) throw new ApiError(401, 'MONITOR_UNAUTHORIZED', 'No autorizado.');
}

export function guardRequest(request: Request, origin: string): void {
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  const suppliedOrigin = request.headers.get('origin');
  if (suppliedOrigin && suppliedOrigin !== origin) throw new ApiError(403, 'ORIGIN_REJECTED', 'Origen de la solicitud no autorizado.');
  if (unsafe && suppliedOrigin !== origin) throw new ApiError(403, 'ORIGIN_REQUIRED', 'Falta verificar el origen de la solicitud.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, 'CROSS_SITE_REJECTED', 'Solicitud externa no autorizada.');
  if (unsafe && request.headers.get('x-requested-with') !== 'grandaptive') throw new ApiError(403, 'CSRF_REJECTED', 'Falta la protección de la solicitud.');
}

export async function readJson(request: Request, limit = 32768): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'JSON_REQUIRED', 'Envía el formulario como JSON.');
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > limit) throw new ApiError(413, 'BODY_TOO_LARGE', 'El contenido es demasiado largo.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'El formulario está vacío.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ApiError(413, 'BODY_TOO_LARGE', 'El contenido es demasiado largo.'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_JSON', 'El formulario no tiene un formato válido.');
  } finally { reader.releaseLock(); }
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(422, 'INVALID_INPUT', 'Revisa los campos y la longitud del formulario.');
  return parsed.data;
}

export function cookieNames(production: boolean) {
  const prefix = production ? '__Host-' : '';
  return { access: `${prefix}ga_access`, refresh: `${prefix}ga_refresh` };
}

export function readCookie(request: Request, name: string): string | undefined {
  const values = (request.headers.get('cookie') ?? '').split(';').map(item => item.trim()).filter(item => item.startsWith(`${name}=`));
  if (values.length > 1) throw new ApiError(400, 'INVALID_COOKIE', 'La sesión no tiene un formato válido.');
  if (!values[0]) return undefined;
  try { return decodeURIComponent(values[0].slice(name.length + 1)); }
  catch { throw new ApiError(400, 'INVALID_COOKIE', 'La sesión no tiene un formato válido.'); }
}

function sessionCookie(name: string, value: string, age: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
}

export function setSession(headers: Headers, session: Session, config: Config): void {
  const names = cookieNames(config.production);
  headers.append('Set-Cookie', sessionCookie(names.access, session.access_token, Math.min(session.expires_in, 3600), config.production));
  headers.append('Set-Cookie', sessionCookie(names.refresh, session.refresh_token, 8 * 3600, config.production));
}

export function clearSession(headers: Headers, config: Config): void {
  for (const name of Object.values(cookieNames(config.production))) headers.append('Set-Cookie', sessionCookie(name, '', 0, config.production));
}

export function secureHeaders(production: boolean): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Vary': 'Origin, Cookie',
  });
  if (production) headers.set('Strict-Transport-Security', 'max-age=31536000');
  return headers;
}

export function privateRateKey(secret: string, value: string): string {
  return createHmac('sha256', Buffer.from(secret, 'hex')).update(value).digest('hex');
}

/** Recibo cifrado y autenticado; no almacena la respuesta IA en DB antes de guardar. */
export function sealReceipt(value: object, secret: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(secret, 'hex'), nonce);
  cipher.setAAD(Buffer.from('grandaptive-ai-receipt-v1'));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url');
}

export function openReceipt(token: string, secret: string): unknown {
  try {
    if (token.length > 24000) throw new Error('length');
    const data = Buffer.from(token, 'base64url');
    if (data.length < 29) throw new Error('length');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(secret, 'hex'), data.subarray(0, 12));
    decipher.setAAD(Buffer.from('grandaptive-ai-receipt-v1'));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
  } catch { throw new ApiError(422, 'INVALID_RECEIPT', 'La respuesta guardable no es válida o fue modificada.'); }
}
