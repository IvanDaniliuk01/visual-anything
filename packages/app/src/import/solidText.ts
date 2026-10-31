/** How the editors write a solid's size and counts (ADR 0075), in the language read in. */
import type { SolidPreparedMessage } from '@visual-anything/core';
import type { PluralText, Translator } from '../i18n';
import { lengthIn, solidSize, type SolidUnit } from '../shell/definitions/solidCommands';

const PARTS: PluralText = { one: '{count} named part', other: '{count} named parts' };
const ANIMATIONS: PluralText = { one: '{count} animation', other: '{count} animations' };
const TEXTURES: PluralText = { one: '{count} texture', other: '{count} textures' };

/** A solid's size in a unit, and in meters when the unit is another. */
export function sizeText(
  t: Translator,
  bounds: SolidPreparedMessage['bounds'],
  unit: SolidUnit,
): string {
  const size = solidSize(bounds);
  const length = (meters: number, each: SolidUnit) => lengthIn(meters, each, t.language);
  const inUnit = t('{x} × {y} × {z} {unit}', {
    x: length(size.x, unit),
    y: length(size.y, unit),
    z: length(size.z, unit),
    unit,
  });
  if (unit === 'm') return inUnit;
  return `${inUnit} ${t('({x} × {y} × {z} m)', {
    x: length(size.x, 'm'),
    y: length(size.y, 'm'),
    z: length(size.z, 'm'),
  })}`;
}

/** What a solid's file holds, counted. */
export function countsText(
  t: Translator,
  solid: Pick<SolidPreparedMessage, 'counts' | 'parts' | 'animations'>,
): string {
  return [
    t('{count} triangles', { count: solid.counts.triangles.toLocaleString(t.language) }),
    t('{count} vertices', { count: solid.counts.vertices.toLocaleString(t.language) }),
    t(PARTS, { count: solid.parts.length }),
    t(TEXTURES, { count: solid.counts.textures }),
    ...(solid.animations && solid.animations.length > 0
      ? [t(ANIMATIONS, { count: solid.animations.length })]
      : []),
  ].join(', ');
}
