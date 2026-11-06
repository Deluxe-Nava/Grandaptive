import type { AIContent, AIResult, Consents, DemoState, Entry, ErrorCode, Operation, RequestSnapshot, Settings, Source } from './contracts.ts';

export class DomainError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.code = code; }
}

export function freshState(): DemoState {
  return {
    entries: [], interpretations: [], draft: '',
    consents: { aiEnabled: false, conversation: false, patterns: false, profileMemory: false, authorizationRevision: 0 },
    settings: { tone: 'neutral', length: 'brief', listenOnly: true, followUp: false, settingsRevision: 0 },
  };
}

export function createEntry(text: string, ownerId: string): Entry {
  if (!text.trim()) throw new Error('Write something before saving.');
  if (text.length > 8000) throw new Error('This demo allows up to 8,000 characters per entry.');
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), ownerId, text, version: 1, createdAt: now, updatedAt: now, availableForAnalysis: false };
}

export function ownedEntry(entries: Entry[], entryId: string, actorId: string): Entry {
  const entry = entries.find(item => item.id === entryId && item.ownerId === actorId);
  if (!entry) throw new DomainError('NOT_FOUND', 'That entry was not found.');
  return entry;
}

export function assertPermission(operation: Operation, consents: Consents, entries: Entry[], safetyPaused = false): void {
  if (!consents.aiEnabled || (operation === 'pattern' ? !consents.patterns : !consents.conversation)) {
    throw new DomainError('CONSENT_REQUIRED', 'This action does not have AI permission.');
  }
  if (operation === 'pattern' && (!entries.length || entries.some(entry => !entry.availableForAnalysis))) {
    throw new DomainError('CONSENT_REQUIRED', 'Only authorized entries can be analyzed.');
  }
  if (safetyPaused) throw new DomainError('SAFETY_PAUSED', 'Interpretations in this conversation are paused.');
}

export function makeSnapshot(operation: Operation, entries: Entry[], consents: Consents, settings: Settings, safetyPaused = false): RequestSnapshot {
  assertPermission(operation, consents, entries, safetyPaused);
  return {
    requestId: crypto.randomUUID(), operation,
    authorizationRevision: consents.authorizationRevision, settingsRevision: settings.settingsRevision,
    sources: entries.map(entry => ({ entryId: entry.id, entryVersion: entry.version })),
  };
}

export function assertFresh(snapshot: RequestSnapshot, state: DemoState, safetyPaused = false): void {
  if (snapshot.authorizationRevision !== state.consents.authorizationRevision || snapshot.settingsRevision !== state.settings.settingsRevision) {
    throw new DomainError('STALE_REQUEST', 'Permissions or preferences changed. Request a new response if you want.');
  }
  const entries = snapshot.sources.map(source => {
    const entry = state.entries.find(item => item.id === source.entryId && item.version === source.entryVersion);
    if (!entry) throw new DomainError('STALE_REQUEST', 'The entry changed or was deleted. The response was discarded.');
    return entry;
  });
  assertPermission(snapshot.operation, state.consents, entries, safetyPaused);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= 8000);
}

/** Control estructural básico. No es detector semántico ni validación clínica. */
export function validateContent(value: unknown, operation: Operation, settings: Settings): AIContent {
  const fail = () => { throw new DomainError('INVALID_OUTPUT', 'The response does not match the agreed format.'); };
  if (!value || typeof value !== 'object') return fail();
  const content = value as Record<string, unknown>;
  if (content.type !== operation) return fail();
  const validText = (x: unknown) => typeof x === 'string' && x.trim().length > 0 && x.length <= 8000;
  switch (operation) {
    case 'accompany':
      if (!validText(content.text) || !isStringArray(content.questions) || !isStringArray(content.recommendations)) return fail();
      if (content.questions.length > 2 || ((settings.listenOnly || !settings.followUp) && content.questions.length > 0)) return fail();
      if (settings.listenOnly && content.recommendations.length > 0) return fail();
      break;
    case 'summary': if (!validText(content.text)) return fail(); break;
    case 'interpret':
      if (!isStringArray(content.reportedFacts) || !isStringArray(content.possibleReadings) || !isStringArray(content.unknowns)) return fail();
      if (content.abstentionReason !== null && !validText(content.abstentionReason)) return fail();
      if (content.possibleReadings.length < 2 && !validText(content.abstentionReason)) return fail();
      break;
    case 'communicate':
      if (!isStringArray(content.formulations) || content.formulations.length < 2 || content.formulations.length > 3) return fail();
      break;
    case 'pattern':
      if (!validText(content.hypothesis) || !validText(content.patternKey) || !['communication', 'sensory', 'energy', 'social', 'strategies'].includes(String(content.category))) return fail();
      break;
  }
  return value as AIContent;
}

export function validateResult(result: AIResult, snapshot: RequestSnapshot, settings: Settings): AIResult {
  if (result.schemaVersion !== '0.1' || result.requestId !== snapshot.requestId) throw new DomainError('INVALID_OUTPUT', 'The response does not match the request.');
  const sameSources = (a: Source[], b: Source[]) => a.length === b.length && a.every((source, i) => source.entryId === b[i]?.entryId && source.entryVersion === b[i]?.entryVersion);
  if (!sameSources(result.context.sources, snapshot.sources) || result.context.profileItemIds.length > 0) {
    throw new DomainError('INVALID_OUTPUT', 'The response cites context not authorized by this adapter.');
  }
  validateContent(result.content, snapshot.operation, settings);
  return result;
}

export function deleteEntry(state: DemoState, id: string): DemoState {
  return { ...state, entries: state.entries.filter(entry => entry.id !== id), interpretations: state.interpretations.filter(item => item.entryId !== id) };
}

export function exportText(state: DemoState): string {
  return ['LOCAL PROTOTYPE · FICTIONAL DATA ONLY', 'Contains no real AI output.', '',
    ...state.entries.flatMap(entry => [
      `ENTRY ${entry.id} · version ${entry.version} · ${entry.createdAt}`, entry.text, '',
      ...state.interpretations.filter(item => item.entryId === entry.id).flatMap(item => [
        `SIMULATED INTERPRETATION · source v${item.entryVersion}${item.entryVersion !== entry.version ? ' · based on an earlier version' : ''}`,
        JSON.stringify(item.content, null, 2), '',
      ]),
    ]),
    'PREFERENCES', JSON.stringify(state.settings, null, 2), 'DEMO PERMISSIONS', JSON.stringify(state.consents, null, 2),
  ].join('\n');
}
