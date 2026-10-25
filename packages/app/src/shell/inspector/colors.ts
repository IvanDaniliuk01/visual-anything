/**
 * The inspector's colors in words and swatches: the colors the picker offers, where a color comes
 * from, and the hints for a color that is hard to see on a canvas (ADR-0033: pointed out where it is
 * picked, never refused).
 */
import {
  MAX_RECENT_COLORS,
  MINIMUM_MARK_CONTRAST,
  THEME_NAMES,
  builtinPackage,
  colorsInUse,
  legibility,
  sameColor,
  type Command,
  type ProjectSnapshot,
  type ShapeColors,
  type ThemeName,
  type TraitOrigin,
} from '@visual-anything/core';
import type { Color, Id } from '@visual-anything/schema';
import { t } from '../../i18n';

/** The colors of an element or a note that the inspector edits. */
export type ColorTrait = 'fill' | 'stroke';

/** The recent colors with `color` first: in capitals, each once, at most as many as the preference keeps. */
export function withRecentColor(recent: readonly Color[], color: Color): Color[] {
  const first = color.toUpperCase();
  return [first, ...recent.filter((each) => !sameColor(each, first))].slice(0, MAX_RECENT_COLORS);
}

/** The most swatches the picker offers. */
export const MAX_SUGGESTIONS = 12;

const inUse = new WeakMap<ProjectSnapshot, readonly Color[]>();

/** Every color the project stores, most used first, worked out once for each state of the project. */
function colorsOf(project: ProjectSnapshot): readonly Color[] {
  let colors = inUse.get(project);
  if (!colors) {
    colors = colorsInUse(project).map((each) => each.color);
    inUse.set(project, colors);
  }
  return colors;
}

/**
 * The colors the picker offers as swatches: the colors picked lately first, then those the project
 * stores, most used first; each once, in capitals, {@link MAX_SUGGESTIONS} at most.
 */
export function suggestedColors(recent: readonly Color[], project: ProjectSnapshot): Color[] {
  const offered: Color[] = [];
  for (const color of [...recent, ...colorsOf(project)]) {
    if (offered.length === MAX_SUGGESTIONS) break;
    if (!offered.some((each) => sameColor(each, color))) offered.push(color.toUpperCase());
  }
  return offered;
}

/**
 * Where a trait's value comes from, in words: "its own", "from Calendar", "from Service, set in this
 * project" for a project appearance, or "built in, from Service". `self`, the definition being edited,
 * calls what it sets itself its own, or "set in this project" for its project appearance.
 */
export function originText(origin: TraitOrigin, nameOf: (id: Id) => string, self?: Id): string {
  if (origin.kind === 'own') return t('its own');
  if (origin.via === 'project') {
    return origin.id === self
      ? t('set in this project')
      : t('from {name}, set in this project', { name: nameOf(origin.id) });
  }
  if (origin.id === self) return origin.builtIn ? t('built in') : t('its own');
  return origin.builtIn
    ? t('built in, from {name}', { name: nameOf(origin.id) })
    : t('from {name}', { name: nameOf(origin.id) });
}

/** Where a definition's appearance is saved, in words, by the package that defines it. */
export function savedIn(packages: readonly { id: Id; name: string }[], packageId?: Id): string {
  if (packageId === undefined) return t('Saved in this project.');
  const builtin = builtinPackage(packageId);
  if (builtin) {
    return t('Saved in this project; the built-in package {name} stays as it is.', {
      name: t.definition(builtin.id, builtin.name),
    });
  }
  const name = packages.find((file) => file.id === packageId)?.name ?? packageId;
  return t('Saved in the package {name}.', { name });
}

/** Joins the ids of what describes a control, leaving out those that are absent. */
export function idsOf(...ids: (string | undefined)[]): string {
  return ids.filter((id) => id !== undefined && id !== '').join(' ');
}

/**
 * The command a way back to an inherited value sends. It is offered only while there is a value of
 * its own to take back, so there always is one.
 */
export function wayBack(command: Command | undefined): Command {
  if (!command) throw new Error('There is no value of its own to take back.');
  return command;
}

/** A contrast ratio as people read it, "2.9:1": cut to one decimal, so that it never reads as enough. */
export function ratioText(ratio: number): string {
  return `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`;
}

/** The hints for each theme's canvas: for a line hard to see on it, and a shape that blends into it. */
const THEME_CANVAS: Readonly<Record<ThemeName, { line: string; shape: string }>> = {
  light: {
    line: 'Hard to see on the light canvas ({ratio}); lines need 3:1.',
    shape: 'Blends into the light canvas: neither its fill nor its stroke reaches 3:1 on it.',
  },
  dark: {
    line: 'Hard to see on the dark canvas ({ratio}); lines need 3:1.',
    shape: 'Blends into the dark canvas: neither its fill nor its stroke reaches 3:1 on it.',
  },
};

/** The hints for a line drawn in these colors, one for each canvas it is hard to see on. */
export function lineHints(colors: Readonly<Record<ThemeName, Color>>): string[] {
  return THEME_NAMES.flatMap((theme) => {
    const ratio = legibility(colors[theme])[theme];
    return ratio < MINIMUM_MARK_CONTRAST
      ? [t(THEME_CANVAS[theme].line, { ratio: ratioText(ratio) })]
      : [];
  });
}

/**
 * The hints for a shape drawn in these colors, one for each canvas that neither its fill nor its
 * stroke stands out from. Its text always takes a color that reads on its fill.
 */
export function shapeHints(colors: Readonly<Record<ThemeName, ShapeColors>>): string[] {
  return THEME_NAMES.flatMap((theme) => {
    const { fill, stroke } = colors[theme];
    const blends =
      legibility(fill)[theme] < MINIMUM_MARK_CONTRAST &&
      legibility(stroke)[theme] < MINIMUM_MARK_CONTRAST;
    return blends ? [t(THEME_CANVAS[theme].shape)] : [];
  });
}
