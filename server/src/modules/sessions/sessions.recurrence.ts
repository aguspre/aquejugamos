import type { RecurrenceFrequency } from '@prisma/client';

/**
 * Grace period after scheduledAt before an active recurring occurrence is
 * automatically archived as completed and rolled over to the next date.
 */
export const SERIES_ROLLOVER_GRACE_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

function addMonthsUtc(anchor: Date, monthsToAdd: number): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + monthsToAdd;
  const targetDay = anchor.getUTCDate();

  // Last day of target month in UTC
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const clampedDay = Math.min(targetDay, lastDayOfTargetMonth);

  return new Date(
    Date.UTC(
      year,
      month,
      clampedDay,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/**
 * Advances `anchorDate` by one or more recurrence intervals until the resulting
 * date is strictly after `referenceNow`.
 */
export function computeNextOccurrenceDate(
  anchorDate: Date,
  frequency: RecurrenceFrequency,
  referenceNow: Date = new Date(),
): Date {
  const minTargetMs = Math.max(anchorDate.getTime(), referenceNow.getTime());

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const stepDays = frequency === 'weekly' ? 7 : 14;
    const stepMs = stepDays * DAY_MS;
    const diffMs = minTargetMs - anchorDate.getTime();
    const steps = Math.floor(diffMs / stepMs) + 1;
    return new Date(anchorDate.getTime() + steps * stepMs);
  }

  // Monthly: step month-by-month from the original anchor day so Jan 31 -> Feb 28 -> Mar 31
  let months = 1;
  let candidate = addMonthsUtc(anchorDate, months);
  while (candidate.getTime() <= minTargetMs && months < 1200) {
    months += 1;
    candidate = addMonthsUtc(anchorDate, months);
  }
  return candidate;
}

export function isOccurrencePastRollover(
  scheduledAt: Date,
  referenceNow: Date = new Date(),
): boolean {
  return scheduledAt.getTime() + SERIES_ROLLOVER_GRACE_MS <= referenceNow.getTime();
}
