/**
 * The benchmark's run with every trait set (ADR 0088, A6.5), with `?traits`: every element gets an
 * appearance of its own that sets every Style trait (border width and dash, corner radius, opacity,
 * a soft shadow and a gradient) and every part of its text (font, size, weight, italics, underline,
 * alignment, where it is written, color, back, border, wrapping and padding), varied from element to
 * element so that the canvas draws many different looks, and some of the view's shapes are turned or
 * mirrored. `?traits=unshadowed` sets the same with no shadow (`none`), so that the two runs side by
 * side say what shapes' own shadows cost at 10,000 elements. Recorded, never held.
 */
import { PALETTE, type ProjectSnapshot } from '@visual-anything/core';
import type { Appearance, ShapePosition, TextStyle } from '@visual-anything/schema';

/** How often a shape is turned, and how often mirrored: every so many shapes in the view. */
export const TURNED_EVERY = 7;
export const MIRRORED_EVERY = 11;

const DASHES = ['solid', 'dashed', 'dotted'] as const;
const FONTS = ['roboto', 'system', 'mono'] as const;
const ALIGNS = ['left', 'center', 'right'] as const;
/** Mostly inside, now and then in a name tag at a side. */
const POSITIONS = ['inside', 'inside', 'inside', 'inside', 'below', 'inside', 'right'] as const;
const FLIPS = ['horizontal', 'vertical', 'both'] as const;

function pick<T>(values: readonly T[], at: number): T {
  return values[at % values.length] as T;
}

/** The appearance of the element at `at`: every Style and Text trait, varied. */
export function everyTrait(at: number, shadow: boolean): Appearance {
  const color = (offset: number) => pick(PALETTE, at + offset).color;
  const text: TextStyle = {
    font: pick(FONTS, at),
    size: 11 + (at % 6),
    bold: at % 2 === 0,
    italic: at % 3 === 0,
    underline: at % 4 === 0,
    align: pick(ALIGNS, at),
    position: pick(POSITIONS, at),
    color: '#1A1A1A',
    background: '#FFFFFF',
    border: color(5),
    wrap: at % 5 !== 0,
    padding: 2 + (at % 4) * 2,
  };
  return {
    borderWidth: 1 + (at % 4),
    dash: pick(DASHES, at),
    cornerRadius: (at % 5) * 4,
    opacity: Math.round((0.6 + (at % 5) * 0.1) * 10) / 10,
    shadow: shadow ? 'soft' : 'none',
    gradient: { to: color(3), direction: at % 2 === 0 ? 'down' : 'right' },
    text,
  };
}

/** The groups of traits `?traits=<group>,…` sets alone, to tell what each costs. */
export type TraitGroup = 'border' | 'radius' | 'opacity' | 'shadow' | 'gradient' | 'text' | 'turn';
const GROUPS: Readonly<Record<TraitGroup, readonly string[]>> = {
  border: ['borderWidth', 'dash'],
  radius: ['cornerRadius'],
  opacity: ['opacity'],
  shadow: ['shadow'],
  gradient: ['gradient'],
  text: ['text'],
  turn: [],
};
export const TRAIT_GROUPS = Object.keys(GROUPS) as TraitGroup[];

/** The position, turned every `TURNED_EVERY` shapes and mirrored every `MIRRORED_EVERY`. */
function turned(position: ShapePosition, at: number): ShapePosition {
  const turn = at % TURNED_EVERY === 0 ? { rotation: 15 + ((at / TURNED_EVERY) % 12) * 25 } : {};
  const mirror = at % MIRRORED_EVERY === 0 ? { flip: pick(FLIPS, at / MIRRORED_EVERY) } : {};
  return { ...position, ...turn, ...mirror };
}

/**
 * The project with every element's own appearance setting every trait, merged over what it has, and
 * some shapes of every view turned or mirrored; containers and rows never turn whatever the view says.
 */
export function withEveryTrait(
  project: ProjectSnapshot,
  options: { shadow: boolean; only?: readonly TraitGroup[] } = { shadow: true },
): ProjectSnapshot {
  const only = options.only;
  const kept = (appearance: Appearance): Appearance =>
    only === undefined
      ? appearance
      : Object.fromEntries(
          Object.entries(appearance).filter(([trait]) =>
            only.some((group) => GROUPS[group].includes(trait)),
          ),
        );
  const turns = only === undefined || only.includes('turn');
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((element, at) => ({
        ...element,
        appearance: { ...element.appearance, ...kept(everyTrait(at, options.shadow)) },
      })),
    },
    views: project.views.map((view) => ({
      ...view,
      positions: turns ? view.positions.map(turned) : view.positions,
    })),
  };
}
