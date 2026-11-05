import { readConfig } from '../src/security.ts';

// Read-only probes. Never print credentials, provider bodies, cookies or user rows.
let failed = false;
function report(label: string, ok: boolean, detail: string) {
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'PENDING'} ${label}: ${detail}`);
}
async function probe(label: string, url: string, init: RequestInit, expected: number, check?: (response: Response) => Promise<boolean>) {
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(12000) });
    const ok = response.status === expected && (!check || await check(response));
    report(label, ok, `HTTP ${response.status}${response.status === expected && !ok ? '; contenido inesperado' : ''}`);
  } catch { report(label, false, 'No se pudo completar la conexión; revisar red, TLS o destino.'); }
}

const production = 'https://grandaptive.vercel.app';
await probe('Producción health GET v0.3', `${production}/api/v1/health`, {}, 200,
  async response => { const value = await response.json(); return value.status === 'ok' && value.version === '0.3'; });
await probe('Producción health HEAD', `${production}/api/v1/health`, { method: 'HEAD' }, 200);
await probe('Producción sesión sin cookies', `${production}/api/v1/auth/session`, {}, 401);

let config;
try { config = readConfig(); report('Configuración local', true, 'Formato válido; no demuestra credenciales válidas en el proveedor.'); }
catch { report('Configuración local', false, 'Revisar variables requeridas y formato; no se muestran valores.'); }
if (config) {
  const database = new URL(config.supabaseUrl);
  if (database.protocol !== 'https:' || !database.hostname.endsWith('.supabase.co') || database.port || database.pathname !== '/' || database.search || database.hash) {
    report('Destino Supabase', false, 'Este diagnóstico sólo envía claves al dominio HTTPS del proyecto *.supabase.co, sin ruta adicional.');
  } else {
    const headers = (key: string) => {
      const value = new Headers({ apikey: key, 'Content-Type': 'application/json' });
      if (!key.startsWith('sb_publishable_') && !key.startsWith('sb_secret_')) value.set('Authorization', `Bearer ${key}`);
      return value;
    };
    await probe('Supabase Auth con clave pública', `${database.origin}/auth/v1/health`, { headers: headers(config.anonKey) }, 200);
    await probe('Supabase esquema 002 con clave pública', `${database.origin}/rest/v1/rpc/backend_readiness`,
      { method: 'POST', headers: headers(config.anonKey), body: '{}' }, 200, async response => await response.json() === 2);
    await probe('Supabase clave de servidor y tabla entries (cero filas)', `${database.origin}/rest/v1/entries?select=id&limit=0`,
      { headers: headers(config.serviceKey) }, 200, async response => { const value = await response.json(); return Array.isArray(value) && value.length === 0; });
  }
  console.log(`INFO IA local: ${config.aiMode}; clave ${config.aiKey ? 'presente (no verificada)' : 'ausente'}. No se invoca OpenAI.`);
  console.log(`INFO CAPTCHA local declarado: ${config.captchaConfigured ? 'activo (requiere prueba real)' : 'inactivo'}.`);
}
console.log('Límite: no prueba login real, aislamiento entre dos cuentas, RLS completo, pagos ni todas las variables de Vercel. No modifica la base.');
process.exitCode = failed ? 1 : 0;
