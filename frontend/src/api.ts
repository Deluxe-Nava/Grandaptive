import type { AIResult, Category, Consents, Settings } from '../../shared/contracts.ts';

export interface Entry { id: string; text: string; version: number; availableForAnalysis: boolean; createdAt: string; updatedAt: string }
export interface ProfileItem { id: string; category: Category; text: string; origin: 'user' | 'ai'; status: 'accepted' | 'pending' | 'rejected' | 'archived'; simulation?: boolean; created_at: string; profile_item_sources?: { entry_id: string; entry_version: number }[] }
export interface SavedReading { id: string; content: AIResult['content']; simulation: boolean; basedOnPreviousVersion: boolean; rejected_readings?: number[]; created_at: string }
export interface ResponseAI extends AIResult { receipt: string; expiresAt: number }
export interface InterfaceSettings { textScale: number; contrast: 'standard' | 'high'; density: 'comfortable' | 'compact'; reducedMotion: boolean; notifications: boolean; startSection: 'diary' | 'profile' | 'settings' }
export const defaultInterface: InterfaceSettings = { textScale: 100, contrast: 'standard', density: 'comfortable', reducedMotion: true, notifications: false, startSection: 'diary' };
export const defaultSettings: Settings = { tone: 'neutral', length: 'brief', listenOnly: true, followUp: false, questionStyle: 'direct', useExamples: false, literalLanguage: true, modality: 'text', settingsRevision: 0 };
export const defaultConsents: Consents = { aiEnabled: false, conversation: false, patterns: false, profileMemory: false, authorizationRevision: 0 };
export const categories: Record<Category, string> = { communication: 'Comunicación', sensory: 'Necesidades sensoriales', energy: 'Energía y bienestar', social: 'Experiencias sociales', strategies: 'Estrategias personales' };
export class ApiError extends Error { code: string; status: number; constructor(message: string, code: string, status: number) { super(message); this.code = code; this.status = status; } }
let refresh: Promise<Response> | undefined;

export async function api<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal, retry = true): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(abort, 25000);
  try {
    const response = await fetch('/api/v1' + path, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'grandaptive' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 401 && retry && !path.startsWith('/auth/login') && !path.startsWith('/auth/options')) {
      refresh ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'grandaptive' }, body: '{}' }).finally(() => { refresh = undefined; });
      let renewed = false;
      try { renewed = (await refresh).ok; } catch { /* Fall back to sign in. */ }
      if (renewed) return await api<T>(path, method, body, signal, false);
      window.dispatchEvent(new Event('grandaptive-session-expired'));
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error?.message ?? 'No se pudo completar la operación. Puedes volver a intentarlo.', data.error?.code ?? 'REQUEST_FAILED', response.status);
    }
    return (path === '/export' ? await response.text() : await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error;
    throw new ApiError('No pudimos conectar. Lo que estás escribiendo se conserva; vuelve a intentarlo cuando tengas conexión.', 'CONNECTION_FAILED', 0);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

const draftPrefix = 'grandaptive-draft:';
export function readDraft(user: string): string { try { return localStorage.getItem(draftPrefix + user) ?? ''; } catch { return ''; } }
export function writeDraft(user: string, text: string): boolean { try { if (text) localStorage.setItem(draftPrefix + user, text); else localStorage.removeItem(draftPrefix + user); return true; } catch { return false; } }
export function clearPrivateLocal(user?: string) {
  try {
    for (const key of Object.keys(localStorage)) if (key === 'challenge-diary-demo-v01' || (key.startsWith(draftPrefix) && (!user || key === draftPrefix + user || key.startsWith(draftPrefix + user + ':')))) localStorage.removeItem(key);
  } catch { /* Browser may forbid storage; server session remains independent. */ }
}
export function applyInterface(settings: InterfaceSettings) {
  const root = document.documentElement;
  root.dataset.scale = String(settings.textScale);
  root.dataset.contrast = settings.contrast;
  root.dataset.density = settings.density;
  root.dataset.motion = settings.reducedMotion ? 'reduced' : 'standard';
}
export function dateLabel(date: string) { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)); }
