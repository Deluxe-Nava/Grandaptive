import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// PostgreSQL embebido, sin red ni credenciales. Sólo simula el esquema auth de Supabase.
const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users(id uuid primary key, instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz, raw_app_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id) on delete cascade, created_at timestamptz, updated_at timestamptz, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  `);
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(name, migrations), 'utf8'));
  }
  await db.exec(await readFile(new URL('../supabase/tests/security.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/tests/prd.sql', import.meta.url), 'utf8'));
  const installation = await db.exec(await readFile(new URL('../supabase/verify-installation.sql', import.meta.url), 'utf8'));
  for (const result of installation) {
    for (const row of result.rows as { result: string }[]) {
      if (row.result !== 'PASS') throw new Error('Falló el diagnóstico de instalación en las migraciones locales.');
    }
  }
  console.log('PASS: migración y pruebas SQL de aislamiento, permisos, versiones, cascada, sesión y cuota en PostgreSQL embebido.');
  console.log('Pendiente: repetir en Supabase con Auth real y dos cuentas del equipo.');
} catch (error) {
  // Sólo SQL de fixtures; nunca usa datos o secretos reales.
  console.error(error instanceof Error ? error.message : 'Falló la prueba SQL.');
  process.exitCode = 1;
} finally { await db.close(); }
