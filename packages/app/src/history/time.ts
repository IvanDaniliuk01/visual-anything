/**
 * When an action of the history was done, as the history panel writes it in the language the app
 * reads in: the time alone for today's actions, and the day too for older ones.
 */
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

/** When an action was done, given in milliseconds since 1970, seen at `now`, on this computer's clock. */
export function actionTime(time: number, now: number, language: Language): string {
  const done = new Date(time);
  const today = done.toDateString() === new Date(now).toDateString();
  return formatOf(language, today).format(done);
}
