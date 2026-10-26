/**
 * How live values are said (ADR 0057): how old one is, short for the canvas and in words for the
 * inspector, and who sent it.
 */
import type { LiveSender } from '@visual-anything/core';
import type { Translator } from '../i18n';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How old a value is, short, as the canvas writes it after a stale value: "3 min", "2 h". */
export function shortAge(t: Translator, ms: number): string {
  if (ms < MINUTE) return t('{count} s', { count: Math.floor(ms / SECOND) });
  if (ms < HOUR) return t('{count} min', { count: Math.floor(ms / MINUTE) });
  if (ms < DAY) return t('{count} h', { count: Math.floor(ms / HOUR) });
  return t('{count} d', { count: Math.floor(ms / DAY) });
}

/**
 * Which step of `shortAge` an age is on: the same number exactly when `shortAge` writes the same
 * text, in any language, so that what writes it knows when to write it again.
 */
export function ageStep(ms: number): number {
  if (ms < MINUTE) return Math.floor(ms / SECOND);
  if (ms < HOUR) return 100 + Math.floor(ms / MINUTE);
  if (ms < DAY) return 200 + Math.floor(ms / HOUR);
  return 300 + Math.floor(ms / DAY);
}

/** How old a value is, in words, as the inspector says it: "12 seconds ago", "3 minutes ago". */
export function ageWords(t: Translator, ms: number): string {
  if (ms < 5 * SECOND) return t('just now');
  if (ms < MINUTE) {
    return t(
      { one: '{count} second ago', other: '{count} seconds ago' },
      { count: Math.floor(ms / SECOND) },
    );
  }
  if (ms < HOUR) {
    return t(
      { one: '{count} minute ago', other: '{count} minutes ago' },
      { count: Math.floor(ms / MINUTE) },
    );
  }
  if (ms < DAY) {
    return t(
      { one: '{count} hour ago', other: '{count} hours ago' },
      { count: Math.floor(ms / HOUR) },
    );
  }
  return t({ one: '{count} day ago', other: '{count} days ago' }, { count: Math.floor(ms / DAY) });
}

/** Who sent a live value, as the inspector names it. */
export function senderWords(
  t: Translator,
  sender: LiveSender,
  packageName: (id: string) => string,
): string {
  switch (sender.kind) {
    case 'claude':
      return t('Claude');
    case 'command-line':
      return t('the command line');
    case 'package':
      return t('the code of “{name}”', { name: packageName(sender.package) });
  }
}
