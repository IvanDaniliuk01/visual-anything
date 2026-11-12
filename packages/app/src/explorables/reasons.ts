/**
 * What an explorable's card says of why it is not running (ADR 0107), alike in the explorable
 * panel, a pane, on the canvas and in exports: the core's sentences (`EXPLORABLE_CARD_WHY`), in the
 * language read in.
 */
import { EXPLORABLE_CARD_WHY, type ExplorableCardReason } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Translator } from '../i18n';

/** Why an explorable shows its card, as its card says it. */
export function reasonText(t: Translator, why: ExplorableCardReason, library?: Id): string {
  return t(EXPLORABLE_CARD_WHY[why], { id: library ?? '' });
}
