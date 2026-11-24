import type { GameSession, RecurrenceFrequency } from '../types/domain';

export const RECURRENCE_LABEL: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

export function getSessionShareUrl(session: Pick<GameSession, 'id' | 'inviteToken' | 'series'>): string {
  const origin = window.location.origin;
  if (session.series?.shareToken) {
    return `${origin}/s/${encodeURIComponent(session.series.shareToken)}`;
  }
  return `${origin}/sessions/${encodeURIComponent(session.id)}?invite=${encodeURIComponent(session.inviteToken)}`;
}
