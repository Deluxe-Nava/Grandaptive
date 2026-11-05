import { z } from 'zod';

export const uuid = z.uuid();
export const operation = z.enum(['accompany', 'summary', 'interpret', 'communicate', 'pattern']);
export const category = z.enum(['communication', 'sensory', 'energy', 'social', 'strategies']);
const text = z.string().min(1).max(8000).refine(value => value.trim().length > 0);
export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(256), captchaToken: z.string().min(1).max(2048) }).strict();
export const entryCreateSchema = z.object({ text, availableForAnalysis: z.boolean().default(false) }).strict();
export const entryPatchSchema = z.object({ expectedVersion: z.number().int().positive(), text: text.optional(), availableForAnalysis: z.boolean().optional() }).strict().refine(value => value.text !== undefined || value.availableForAnalysis !== undefined);
export const consentsSchema = z.object({ expectedRevision: z.number().int().nonnegative(), aiEnabled: z.boolean(), conversation: z.boolean(), patterns: z.boolean(), profileMemory: z.boolean() }).strict();
export const settingsSchema = z.object({ tone: z.enum(['neutral', 'warm', 'practical']), length: z.enum(['brief', 'detailed']), listenOnly: z.boolean(), followUp: z.boolean() }).strict();
export const settingsPatchSchema = z.object({ expectedRevision: z.number().int().nonnegative(), settings: settingsSchema }).strict();
export const interfaceSettingsSchema = z.object({
  textScale: z.number().int().min(100).max(200).default(100),
  contrast: z.enum(['standard', 'high']).default('standard'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  reducedMotion: z.boolean().default(true),
  notifications: z.boolean().default(false),
  startSection: z.enum(['diary', 'profile', 'settings']).default('diary'),
}).strict();
export const profileSchema = z.object({ category, text: z.string().min(1).max(2000).refine(value => value.trim().length > 0) }).strict();
export const decisionSchema = z.object({ decision: z.enum(['accept', 'edit', 'reject', 'archive']), text: z.string().min(1).max(2000).optional() }).strict().refine(value => value.decision !== 'edit' || Boolean(value.text?.trim()));
export const conversationSchema = z.object({ entryId: uuid }).strict();
export const aiSchema = z.object({
  operation, entryIds: z.array(uuid).min(1).max(5).refine(value => new Set(value).size === value.length),
  conversationId: uuid, turnText: z.string().max(2000).optional(),
  context: z.enum(['school', 'family', 'work', 'friendship']).optional(),
  action: z.enum(['continue', 'skip', 'change-topic', 'listen']).default('continue'),
}).strict().refine(value => value.operation === 'pattern' || value.entryIds.length === 1);
export const receiptBodySchema = z.object({ receipt: z.string().min(20).max(24000) }).strict();
export const receiptSchema = z.object({
  userId: uuid, expiresAt: z.number(), operation,
  sources: z.array(z.object({ entryId: uuid, entryVersion: z.number().int().positive() })).min(1).max(10),
  authorizationRevision: z.number().int(), settingsRevision: z.number().int(), conversationId: uuid,
  profileItemIds: z.array(uuid), profileVersions: z.record(uuid, z.string()), content: z.unknown(), simulation: z.boolean(),
}).strict();
