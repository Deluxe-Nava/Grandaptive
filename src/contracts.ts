/** Contratos v0.1 propuestos. Las validaciones de este demo no sustituyen al servidor. */
export type Operation = 'accompany' | 'summary' | 'interpret' | 'communicate' | 'pattern';
export type Category = 'communication' | 'sensory' | 'energy' | 'social' | 'strategies';
export type ErrorCode = 'CONSENT_REQUIRED' | 'SAFETY_PAUSED' | 'STALE_REQUEST' | 'PROVIDER_UNAVAILABLE' | 'INVALID_OUTPUT' | 'NOT_FOUND';

export interface Entry {
  id: string;
  ownerId: string;
  text: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  availableForAnalysis: boolean;
}

export interface Consents {
  aiEnabled: boolean;
  conversation: boolean;
  patterns: boolean;
  profileMemory: boolean;
  authorizationRevision: number;
}

export interface Settings {
  tone: 'neutral' | 'warm' | 'practical';
  length: 'brief' | 'detailed';
  listenOnly: boolean;
  followUp: boolean;
  questionStyle?: 'direct' | 'open';
  useExamples?: boolean;
  literalLanguage?: boolean;
  modality?: 'text';
  settingsRevision: number;
}

export interface Source { entryId: string; entryVersion: number }
export interface ProfileItem {
  id: string;
  ownerId: string;
  category: Category;
  text: string;
  origin: 'user' | 'ai';
  status: 'pending' | 'accepted' | 'rejected' | 'archived';
  sources: Source[];
  updatedAt: string;
}

export interface RequestSnapshot {
  requestId: string;
  operation: Operation;
  authorizationRevision: number;
  settingsRevision: number;
  sources: Source[];
}

export type AIContent =
  | { type: 'accompany'; text: string; questions: string[]; recommendations: string[] }
  | { type: 'summary'; text: string }
  | { type: 'interpret'; reportedFacts: string[]; possibleReadings: string[]; unknowns: string[]; abstentionReason: string | null }
  | { type: 'communicate'; formulations: string[] }
  | { type: 'pattern'; hypothesis: string; category: Category; patternKey: string };

export interface AIResult {
  schemaVersion: '0.1';
  requestId: string;
  simulation: boolean;
  content: AIContent;
  context: { sources: Source[]; profileItemIds: string[] };
}

export interface Interpretation {
  id: string;
  entryId: string;
  entryVersion: number;
  origin: 'ai';
  simulation: boolean;
  content: AIContent;
  savedAt: string;
}

export interface DemoState {
  entries: Entry[];
  interpretations: Interpretation[];
  draft: string;
  consents: Consents;
  settings: Settings;
}
