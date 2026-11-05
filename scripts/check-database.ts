import { readFile } from 'node:fs/promises';
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
    create table auth.users(id uuid primary key, instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id) on delete cascade, created_at timestamptz, updated_at timestamptz, not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/001_backend.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/tests/security.sql', import.meta.url), 'utf8'));
  console.log('PASS: migración y pruebas SQL de aislamiento, permisos, versiones, cascada, sesión y cuota en PostgreSQL embebido.');
  console.log('Pendiente: repetir en Supabase con Auth real y dos cuentas del equipo.');
} catch (error) {
  // Sólo SQL de fixtures; nunca usa datos o secretos reales.
  console.error(error instanceof Error ? error.message : 'Falló la prueba SQL.');
  process.exitCode = 1;
} finally { await db.close(); }
