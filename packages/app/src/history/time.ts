/**
 * When an action of the history was done, as the history panel writes it in the language the app
 * reads in: the time alone for today's actions, and the day too for older ones.
 */
import { useSyncExternalStore } from 'react';
import type { Language } from '../i18n';

const TODAY: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const EARLIER: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
};

const formats = new Map<string, Intl.DateTimeFormat>();

function formatOf(language: Language, today: boolean): Intl.DateTimeFormat {
  const key = `${language} ${today ? 'today' : 'earlier'}`;
  let format = formats.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(language, today ? TODAY : EARLIER);
    formats.set(key, format);
  }
  return format;
}

/**
 * When an action was done, given in milliseconds since 1970, as seen on `today`, any moment of the
 * day it is now on this computer's clock.
 */
export function actionTime(time: number, today: number, language: Language): string {
  const done = new Date(time);
  const sameDay = done.toDateString() === new Date(today).toDateString();
  return formatOf(language, sameDay).format(done);
}

/** How often the clock is read again, so that yesterday's actions say so soon after midnight. */
const CLOCK_EVERY = 60_000;

/** The start of today on this computer's clock: the same number all day long. */
function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function watchTheDay(changed: () => void): () => void {
  const timer = setInterval(changed, CLOCK_EVERY);
  return () => clearInterval(timer);
}

/** The start of today, which changes at midnight and renders the component again then. */
export function useToday(): number {
  return useSyncExternalStore(watchTheDay, startOfToday, startOfToday);
}
