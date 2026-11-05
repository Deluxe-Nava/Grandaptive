import { createClient } from '@supabase/supabase-js';
import { ApiError, privateRateKey, type Config } from './security.ts';

/** Cliente nuevo por solicitud: nunca reutilizar una sesión de otro usuario. */
export function userDatabase(config: Config, accessToken?: string) {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` }, fetch: timedFetch } : { fetch: timedFetch },
  });
}

export function adminDatabase(config: Config) {
  return createClient(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: timedFetch },
  });
}

const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });

export function dataOrThrow<T>(result: { data: T; error: { code?: string } | null }): NonNullable<T> {
  if (result.error) {
    if (result.error.code === 'P0002') throw new ApiError(404, 'NOT_FOUND', 'No se encontró el recurso.');
    if (['42501', 'PGRST301', 'PGRST302'].includes(result.error.code ?? '')) throw new ApiError(403, 'ACCESS_DENIED', 'No tienes acceso a esta operación.');
    if (['23503', '23514', '22023', 'P0001', '40001', '23505'].includes(result.error.code ?? '')) throw new ApiError(409, 'STATE_CONFLICT', 'Los datos cambiaron o la operación no es válida. Actualiza y vuelve a intentarlo.');
    throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'No se pudo completar la operación. Conserva tu borrador y vuelve a intentarlo.');
  }
  if (result.data === null || result.data === undefined) throw new ApiError(404, 'NOT_FOUND', 'No se encontró el recurso.');
  return result.data;
}

export type UserDatabase = ReturnType<typeof userDatabase>;

export async function rateLimit(config: Config, key: string, limit: number, seconds: number): Promise<void> {
  const allowed = dataOrThrow(await adminDatabase(config).rpc('consume_rate_limit', { p_key: privateRateKey(config.secret, key), p_limit: limit, p_window_seconds: seconds }));
  if (!allowed) throw new ApiError(429, 'RATE_LIMITED', 'Se alcanzó el límite temporal. Puedes seguir usando los datos ya cargados y reintentar más tarde.');
}
