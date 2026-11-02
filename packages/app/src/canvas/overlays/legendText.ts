/**
 * What a legend writes (ADR 0055), in the language read in: the line under each overlay's title that
 * says what it changes by which attribute, and each entry's text. The canvas's panel and the PNG's
 * band both write it so, from the core's description; what people wrote, titles, labels and values,
 * is never translated.
 */
import type { LegendEntry, LegendOverlay } from '@visual-anything/core';
import type { Translator } from '../../i18n';
import { RELATION_TYPES_LEGEND } from './relationLegend';

/** What an overlay changes, by which attribute: "Fill by owner", "Line width by rate". */
export function legendSubtitle(t: Translator, part: LegendOverlay): string {
  // The relation types' part names each type's line (ADR 0086).
  if (part.id === RELATION_TYPES_LEGEND) return t('Line color and dash by relation type');
  const attribute = part.attribute;
  if (part.of === 'relations') {
    switch (part.channel) {
      case 'stroke':
        return t('Line color by {attribute}', { attribute });
      case 'size':
        return t('Line width by {attribute}', { attribute });
      case 'badge':
        return t('Label by {attribute}', { attribute });
      case 'opacity':
        return t('Line opacity by {attribute}', { attribute });
      case 'fill':
        return t('Fill by {attribute}', { attribute });
    }
  }
  switch (part.channel) {
    case 'fill':
      return t('Fill by {attribute}', { attribute });
    case 'stroke':
      return t('Stroke by {attribute}', { attribute });
    case 'size':
      return t('Size by {attribute}', { attribute });
    case 'badge':
      return t('Badge by {attribute}', { attribute });
    case 'opacity':
      return t('Opacity by {attribute}', { attribute });
  }
}

/** What an entry stands for: people's label or value, any other value, or the value itself. */
export function entryLabel(t: Translator, entry: LegendEntry): string {
  switch (entry.kind) {
    case 'otherwise':
      return t('Any other value');
    case 'passthrough':
      return t('The value itself');
    default:
      return entry.label ?? '';
  }
}

/**
 * What an entry of size or opacity says of its value, as the language writes numbers: "×1.5", "40%"
 * ("×1,5", "40 %"); nothing for the others.
 */
export function entryAmount(t: Translator, entry: LegendEntry): string | undefined {
  if (entry.size !== undefined) {
    return `×${new Intl.NumberFormat(t.language, { maximumFractionDigits: 2 }).format(entry.size)}`;
  }
  if (entry.opacity !== undefined) {
    return new Intl.NumberFormat(t.language, { style: 'percent' }).format(entry.opacity);
  }
  return undefined;
}

/** The whole of an entry, as a screen reader or a file reads it: its label, with its amount or badge. */
export function entryText(t: Translator, entry: LegendEntry): string {
  const label = entryLabel(t, entry);
  const amount = entry.badge === undefined ? entryAmount(t, entry) : `“${entry.badge}”`;
  return amount === undefined ? label : `${label}: ${amount}`;
}
