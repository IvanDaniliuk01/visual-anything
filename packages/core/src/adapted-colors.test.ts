/**
 * Stored colors adapted on the dark canvas (ADR 0087): the one function that turns a color, and how
 * the core's dark colors take it when the drawing defaults ask for it.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PackageFile } from '@visual-anything/schema';
import {
  CANVAS_BACKGROUNDS,
  adaptedForDark,
  arrowColorOf,
  colorDifference,
  contrastRatio,
  labOf,
  noteColorsOf,
  turnKeepsChroma,
} from './colors';
import {
  componentDarkColorsOf,
  darkColorsOf,
  definitionsOf,
  drawnColorsOf,
  drawnRelationAppearanceOf,
  relationDarkStrokeOf,
  relationTypeDarkStrokeOf,
} from './definitions';
import { builtinPackage } from './builtin';
import {
  DRAWING_BEFORE_A5,
  DRAWING_PRESETS,
  drawingProblems,
  resolveDrawing,
  storedColorsIn,
} from './drawing';

describe('the drawing default', () => {
  it('draws stored colors as stored in every preset', () => {
    for (const preset of Object.values(DRAWING_PRESETS)) {
      expect(preset.colors.storedColorsInDark).toBe('as-stored');
    }
    expect(DRAWING_BEFORE_A5.colors.storedColorsInDark).toBe('as-stored');
  });

  it('is set by a project and set again by a view, and adapts only on the dark canvas', () => {
    const project = { colors: { storedColorsInDark: 'adapted' as const } };
    const drawing = resolveDrawing(project, undefined);
    expect(drawing.colors.storedColorsInDark).toBe('adapted');
    expect(storedColorsIn(drawing, 'dark')).toBe('adapted');
    expect(storedColorsIn(drawing, 'light')).toBe('as-stored');
    const view = resolveDrawing(project, { colors: { storedColorsInDark: 'as-stored' } });
    expect(storedColorsIn(view, 'dark')).toBe('as-stored');
    // A view with a preset of its own starts from it, without the project's values.
    expect(resolveDrawing(project, { preset: 'dense' }).colors.storedColorsInDark).toBe(
      'as-stored',
    );
  });

  it('takes only its two choices', () => {
    expect(drawingProblems({ colors: { storedColorsInDark: 'adapted' } })).toEqual([]);
    expect(drawingProblems({ colors: { storedColorsInDark: 'inverted' } })).toEqual([
      'colors.storedColorsInDark is one of as-stored, adapted.',
    ]);
  });
});

const color = fc
  .integer({ min: 0, max: 0xffffff })
  .map((value) => `#${value.toString(16).padStart(6, '0').toUpperCase()}`);

function channels(value: string): number[] {
  return [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16));
}

function chroma(value: string): number {
  const [, a, b] = labOf(value);
  return Math.hypot(a, b);
}

describe('turning a stored color for the dark canvas', () => {
  it('turns its lightness and keeps its hue: white and black swap, a mid gray stays near itself', () => {
    expect(adaptedForDark('#FFFFFF')).toBe('#000000');
    expect(adaptedForDark('#000000')).toBe('#FFFFFF');
    expect(colorDifference(adaptedForDark('#777777'), '#777777')).toBeLessThan(3);
    // A pale pink becomes a dark red, never a cyan, which inverting would give.
    const pink = adaptedForDark('#FFC9C9');
    const [, a, b] = labOf(pink);
    expect(a).toBeGreaterThan(0);
    expect(Math.abs(b)).toBeLessThan(a);
    expect(labOf(pink)[0]).toBeLessThan(25);
  });

  it('writes #RRGGBB in capitals, reads either case, and keeps the spelling of a color that turns into itself', () => {
    expect(adaptedForDark('#ffc9c9')).toBe(adaptedForDark('#FFC9C9'));
    expect(adaptedForDark('#ffc9c9')).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('gives L* → 100 − L*, within rounding', () => {
    fc.assert(
      fc.property(color, (value) => {
        const turned = adaptedForDark(value);
        expect(Math.abs(labOf(turned)[0] - (100 - labOf(value)[0]))).toBeLessThan(0.6);
      }),
      { numRuns: 2000 },
    );
  });

  // Every 7th color of the cube whose turn keeps its chroma, 1,154,295 of them, came back within
  // three steps and ΔE 1.46; nearly all within one (ADR 0087's clarifications).
  it('gives the color back when turned twice, within three steps of each channel and ΔE 1.5, wherever its turn kept its chroma', () => {
    fc.assert(
      fc.property(
        color.filter((value) => turnKeepsChroma(value)),
        (value) => {
          const back = adaptedForDark(adaptedForDark(value));
          const before = channels(value);
          channels(back).forEach((channel, at) => {
            expect(Math.abs(channel - (before[at] ?? 0))).toBeLessThanOrEqual(3);
          });
          expect(colorDifference(value, back)).toBeLessThan(1.5);
        },
      ),
      { numRuns: 3000 },
    );
  });

  it('gives back, turned twice, a color whose chroma it lowered with its lightness and no more chroma', () => {
    fc.assert(
      fc.property(color, (value) => {
        const back = adaptedForDark(adaptedForDark(value));
        expect(Math.abs(labOf(back)[0] - labOf(value)[0])).toBeLessThan(1);
        expect(chroma(back)).toBeLessThan(chroma(value) + 1.5);
      }),
      { numRuns: 2000 },
    );
  });

  it('keeps marks readable: 3:1 on the light canvas gives 2.5:1 on the dark one, and 3.5:1 gives 3:1', () => {
    fc.assert(
      fc.property(color, (value) => {
        const light = contrastRatio(value, CANVAS_BACKGROUNDS.light);
        const dark = contrastRatio(adaptedForDark(value), CANVAS_BACKGROUNDS.dark);
        if (light >= 3) expect(dark).toBeGreaterThanOrEqual(2.5);
        if (light >= 3.5) expect(dark).toBeGreaterThanOrEqual(3);
        if (light >= 4.5) expect(dark).toBeGreaterThanOrEqual(3.9);
      }),
      { numRuns: 3000 },
    );
  });

  it('makes a pale fill that glares on the dark canvas dark', () => {
    for (const pale of ['#FFF3BF', '#FFC9C9', '#E3F2E9', '#DCEBFF']) {
      expect(contrastRatio(adaptedForDark(pale), CANVAS_BACKGROUNDS.dark)).toBeLessThan(2);
    }
  });
});

const project: PackageFile = {
  id: 'mine',
  name: 'Mine',
  components: [
    {
      id: 'mine.trigger',
      name: 'Trigger',
      derivesFrom: 'essence',
      appearance: { fill: '#FFC9C9', stroke: '#C92A2A' },
    },
    { id: 'mine.plain', name: 'Plain', derivesFrom: 'essence' },
  ],
  relationTypes: [
    {
      id: 'mine.fires',
      name: 'fires',
      derivesFrom: 'relates-to',
      direction: 'directed',
      appearance: { stroke: '#F783AC' },
    },
  ],
};

function fail(): never {
  throw new Error('missing');
}

const systems = builtinPackage('systems') as PackageFile;
const definitions = definitionsOf([systems, project]);

describe('dark colors with stored colors adapted', () => {
  it('adapts the colors a project sets, and only on the dark canvas', () => {
    const trigger = { component: 'mine.trigger' };
    expect(darkColorsOf(trigger, definitions)).toEqual({ fill: '#FFC9C9', stroke: '#C92A2A' });
    expect(darkColorsOf(trigger, definitions, 'adapted')).toEqual({
      fill: adaptedForDark('#FFC9C9'),
      stroke: adaptedForDark('#C92A2A'),
    });
    expect(drawnColorsOf(trigger, definitions, 'light', 'adapted')).toEqual({
      fill: '#FFC9C9',
      stroke: '#C92A2A',
    });
    const own = { component: 'mine.plain', appearance: { fill: '#FFF3BF' } };
    expect(darkColorsOf(own, definitions, 'adapted').fill).toBe(adaptedForDark('#FFF3BF'));
  });

  it('leaves built-in colors as they are: their dark shades, whatever the setting', () => {
    for (const id of [
      'essence',
      ...[...definitions.components.keys()].filter((each) => each.startsWith('systems.')),
    ]) {
      const element = { component: id };
      expect(darkColorsOf(element, definitions, 'adapted')).toEqual(
        darkColorsOf(element, definitions),
      );
    }
    for (const id of [
      'relates-to',
      ...[...definitions.relationTypes.keys()].filter((each) => each.startsWith('systems.')),
    ]) {
      const relation = { relationType: id };
      expect(relationDarkStrokeOf(relation, definitions, 'adapted')).toBe(
        relationDarkStrokeOf(relation, definitions),
      );
    }
  });

  it('adapts a built-in component’s trait the project sets, and keeps the other’s dark shade', () => {
    const element = { component: 'essence', appearance: { stroke: '#FFFFFF' } };
    const adapted = darkColorsOf(element, definitions, 'adapted');
    expect(adapted.stroke).toBe('#000000');
    // A stroke drawn under 3:1 on the dark canvas keeps Essence's fill in its light value, as before.
    expect(contrastRatio(adapted.stroke, CANVAS_BACKGROUNDS.dark)).toBeLessThan(3);
    expect(adapted.fill).toBe(drawnColorsOf({ component: 'essence' }, definitions, 'light').fill);
    // A stroke drawn above 3:1 there lets it take its dark shade.
    const black = { component: 'essence', appearance: { stroke: '#000000' } };
    expect(darkColorsOf(black, definitions, 'adapted')).toEqual({
      fill: componentDarkColorsOf(definitions.component('essence') ?? fail()).fill,
      stroke: '#FFFFFF',
    });
  });

  it('adapts a relation’s own stroke and its relation type’s stored one', () => {
    expect(relationDarkStrokeOf({ relationType: 'mine.fires' }, definitions, 'adapted')).toBe(
      adaptedForDark('#F783AC'),
    );
    expect(
      relationDarkStrokeOf(
        { relationType: 'relates-to', appearance: { stroke: '#FFE066' } },
        definitions,
        'adapted',
      ),
    ).toBe(adaptedForDark('#FFE066'));
    const type = definitions.relationType('mine.fires');
    expect(type && relationTypeDarkStrokeOf(type, 'adapted')).toBe(adaptedForDark('#F783AC'));
    expect(
      drawnRelationAppearanceOf({ relationType: 'mine.fires' }, definitions, 'light', 'adapted')
        .stroke,
    ).toBe('#F783AC');
  });

  it('gives a component’s own dark colors once for each setting', () => {
    const component = definitions.component('mine.trigger');
    if (!component) throw new Error('no component');
    expect(componentDarkColorsOf(component)).toBe(component.darkColors);
    expect(componentDarkColorsOf(component, 'adapted')).toBe(
      componentDarkColorsOf(component, 'adapted'),
    );
  });

  it('adapts the own colors of notes and free arrows, and never the theme’s', () => {
    const theme = { noteFill: '#2A2F38', noteStroke: '#9AA5B1', freeArrow: '#C5CED8' };
    const note = noteColorsOf({ fill: '#FFF3BF' }, theme, true);
    expect(note.fill).toEqual({ color: adaptedForDark('#FFF3BF'), origin: { kind: 'own' } });
    expect(note.stroke).toEqual({ color: '#9AA5B1', origin: { kind: 'theme' } });
    expect(arrowColorOf({ stroke: '#000000' }, theme, true).color).toBe('#FFFFFF');
    expect(arrowColorOf({}, theme, true).color).toBe('#C5CED8');
    expect(noteColorsOf({ fill: '#FFF3BF' }, theme).fill.color).toBe('#FFF3BF');
  });
});
