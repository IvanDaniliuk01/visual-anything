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
  if (origin.kind === 'own') return 'its own';
  if (origin.via === 'project') {
    return origin.id === self
      ? 'set in this project'
      : `from ${nameOf(origin.id)}, set in this project`;
  }
  if (origin.id === self) return origin.builtIn ? 'built in' : 'its own';
  return origin.builtIn ? `built in, from ${nameOf(origin.id)}` : `from ${nameOf(origin.id)}`;
}

/** Where a definition's appearance is saved, in words, by the package that defines it. */
export function savedIn(packages: readonly { id: Id; name: string }[], packageId?: Id): string {
  if (packageId === undefined) return 'Saved in this project.';
  const builtin = builtinPackage(packageId);
  if (builtin) {
    return `Saved in this project; the built-in package ${builtin.name} stays as it is.`;
  }
  const name = packages.find((file) => file.id === packageId)?.name ?? packageId;
  return `Saved in the package ${name}.`;
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

/** The hints for a line drawn in these colors, one for each canvas it is hard to see on. */
export function lineHints(colors: Readonly<Record<ThemeName, Color>>): string[] {
  return THEME_NAMES.flatMap((theme) => {
    const ratio = legibility(colors[theme])[theme];
    return ratio < MINIMUM_MARK_CONTRAST
      ? [`Hard to see on the ${theme} canvas (${ratioText(ratio)}); lines need 3:1.`]
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
    return blends
      ? [`Blends into the ${theme} canvas: neither its fill nor its stroke reaches 3:1 on it.`]
      : [];
  });
}
