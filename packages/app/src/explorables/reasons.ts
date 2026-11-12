/**
 * What an explorable's card says of why it is not running (ADR 0107), alike in the explorable
 * panel, a pane, and on the canvas (A10.3).
 */
import type { Id } from '@visual-anything/schema';
import type { useT } from '../i18n';
import type { CardReason } from './ExplorableView';

/** Why an explorable shows its card, as its card says it. */
export function reasonText(t: ReturnType<typeof useT>, why: CardReason, library?: Id): string {
  switch (why) {
    case 'not-approved':
      return t('Not approved yet: Approve to run.');
    case 'no-text':
      return t('Not running: its file in explorables/ is missing, or past 512 KiB.');
    case 'library-missing':
      return t('Not running: its package does not define the script library “{id}”.', {
        id: library ?? '',
      });
    case 'silent':
      return t('Stopped: it stopped answering.');
    case 'left':
      return t('Stopped: it left its page, so it no longer gets the data.');
    case 'never-answered':
      return t('Stopped: it did not start. Its file may have changed since; run it again to try.');
    case 'hung':
      return t(
        'Stopped: it was running when this tab stopped answering, so it waits for you to run it again.',
      );
    case 'starting':
      return t('Starting…');
    case 'not-connected':
      return t('Not running: Visual Anything is not connected.');
    case 'no-app':
      return t('Not running here.');
  }
}
