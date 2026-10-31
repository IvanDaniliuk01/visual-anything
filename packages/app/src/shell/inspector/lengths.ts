/**
 * Lengths and angles in the inspector's Pose section (ADR 0076). A length is shown in mm, cm, m or
 * km, whichever keeps the number between 1 and 1,000, to the micrometer, and is read in any of those
 * or in inches; a number written without a unit is read in the unit the field showed. An angle is
 * shown and read in degrees.
 */
import { MAX_POSE_COORDINATE } from '@visual-anything/core';
import { t } from '../../i18n';
import type { Reading } from './attributes';

/** The units a length is shown in. */
export type LengthUnit = 'mm' | 'cm' | 'm' | 'km';

/**
 * The units a length is read in, with the meters one of each is as a fraction, so that "12 mm" reads
 * as 0.012 m and "3 in" as 0.0762 m, without the noise multiplying by 0.001 or 0.0254 adds.
 */
const METERS_IN: Readonly<Record<string, readonly [number, number]>> = {
  mm: [1, 1000],
  cm: [1, 100],
  m: [1, 1],
  km: [1000, 1],
  in: [254, 10_000],
  inch: [254, 10_000],
  inches: [254, 10_000],
  '"': [254, 10_000],
  '″': [254, 10_000],
};

/** A number of a unit, in meters. */
function inMeters(value: number, unit: string): number {
  const [times, over] = METERS_IN[unit] ?? [1, 1];
  return (value * times) / over;
}

/** The decimals each unit is shown with, so that every one shows a micrometer. */
const DECIMALS: Readonly<Record<LengthUnit, number>> = { mm: 3, cm: 4, m: 6, km: 9 };

/**
 * The unit a length is shown in: the largest that keeps its number at 1 or more, so that it stays
 * between 1 and 1,000; meters for none at all, and millimeters below one.
 */
export function lengthUnitOf(meters: number): LengthUnit {
  const size = Math.abs(meters);
  if (size === 0 || !Number.isFinite(size)) return 'm';
  if (size >= 1000) return 'km';
  if (size >= 1) return 'm';
  if (size >= 0.01) return 'cm';
  return 'mm';
}

/** A number as the field shows it: rounded to `decimals`, without trailing zeros or a negative zero. */
function shown(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** A length in meters as the inspector shows it, such as "4 cm" or "1.25 m". */
export function formatLength(meters: number): string {
  const unit = lengthUnitOf(meters);
  const [times, over] = METERS_IN[unit] ?? [1, 1];
  return `${shown((meters * over) / times, DECIMALS[unit])} ${unit}`;
}

/** A number, as JavaScript writes one or with the minus sign typography uses, and its unit. */
const LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|km|m|inches|inch|in|"|″)?$/i;

/**
 * A length typed in a field, in meters: a number with mm, cm, m, km or in (inches), or alone, in the
 * unit the field showed.
 */
export function readLength(text: string, shownIn: LengthUnit = 'm'): Reading<number> {
  const match = LENGTH.exec(text.trim().replaceAll('−', '-'));
  const value = match ? Number(match[1]) : Number.NaN;
  if (!match || !Number.isFinite(value)) {
    return { ok: false, message: t('Enter a length, such as 12 cm, 1.5 m or 3 in.') };
  }
  const unit = (match[2] ?? shownIn).toLowerCase();
  const meters = inMeters(value, unit);
  return { ok: true, value: Object.is(meters, -0) ? 0 : meters };
}

/** Why a typed length cannot be a pose's coordinate; `undefined` when it can. */
export function lengthProblem(text: string, shownIn: LengthUnit = 'm'): string | undefined {
  const reading = readLength(text, shownIn);
  if (!reading.ok) return reading.message;
  return Math.abs(reading.value) > MAX_POSE_COORDINATE
    ? t('Enter a length of at most 1,000 km either way.')
    : undefined;
}

/** An angle in degrees as the inspector shows it, such as "90°", to a ten-thousandth of a degree. */
export function formatDegrees(degrees: number): string {
  return `${shown(degrees, 4)}°`;
}

const ANGLE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(°|deg|degrees)?$/i;

/** An angle typed in a field, in degrees, with or without "°". */
export function readDegrees(text: string): Reading<number> {
  const match = ANGLE.exec(text.trim().replaceAll('−', '-'));
  const value = match ? Number(match[1]) : Number.NaN;
  return match && Number.isFinite(value)
    ? { ok: true, value: Object.is(value, -0) ? 0 : value }
    : { ok: false, message: t('Enter an angle in degrees, such as 90 or -45.') };
}
