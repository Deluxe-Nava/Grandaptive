import type { AIResult, RequestSnapshot, Settings } from '../../shared/contracts.ts';
import { DomainError } from '../../shared/core.ts';

/** Adaptador determinista; no usa fetch, no analiza el texto y no contiene credenciales. */
export async function simulateAccompaniment(snapshot: RequestSnapshot, settings: Settings, fail = false): Promise<AIResult> {
  await new Promise(resolve => setTimeout(resolve, 650));
  if (fail) throw new DomainError('PROVIDER_UNAVAILABLE', 'The simulated service is not available. Your entry is still saved.');
  const greeting = { neutral: 'Your entry stays here.', warm: 'Thank you for sharing this entry.', practical: 'Entry available.' }[settings.tone];
  return {
    schemaVersion: '0.1', requestId: snapshot.requestId, simulation: true,
    content: {
      type: 'accompany',
      text: settings.listenOnly ? `${greeting} You can leave it as it is, without analyzing it.` : `${greeting}${settings.length === 'detailed' ? ' You can answer, skip the question, or switch to just listen whenever you want.' : ''}`,
      questions: settings.listenOnly || !settings.followUp ? [] : ['Is there anything about your surroundings or your energy you want to note?'],
      recommendations: [],
    },
    context: { sources: snapshot.sources, profileItemIds: [] },
  };
}
