/**
 * The format panel's traits (ADR 0088): a shape's border, corners, opacity, shadow, gradient and how
 * it writes the name, a relation's opacity, and a shape's turn and mirroring in a view. Each is set
 * trait by trait, part by part for the text, inherited along the definitions, refused outside its
 * range, and undone whole; the palette reads on both canvases.
 */
import type { Appearance, TextStyle } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveAppearance } from './appearance';
import { ESSENCE } from './builtin/essence-and-relates-to';
import {
  CANVAS_BACKGROUNDS,
  colorDifference,
  contrastRatio,
  MINIMUM_COLOR_DIFFERENCE,
  MINIMUM_MARK_CONTRAST,
} from './colors';
import { executeCommand, type Command } from './commands';
import { appearanceOf, relationAppearanceOf } from './definitions';
import { applyOperations } from './operations';
import { PALETTE } from './palette';
import { placementJoins } from './placement-joins';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn } from './state';
import { colorProject, sequentialIds } from './test/fixtures';

function run(command: Command, state: ProjectSnapshot = colorProject()) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

function ok(command: Command, state: ProjectSnapshot = colorProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refusal(command: Command, state?: ProjectSnapshot): string {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.message).join(' ');
}

const traitsOf = (id: string, appearanceTraits: Record<string, unknown>): Command => ({
  type: 'update-element',
  id,
  changes: { appearanceTraits },
});

const elementOf = (state: ProjectSnapshot, id: string) => {
  const element = state.model.elements.find((each) => each.id === id);
  if (element === undefined) throw new Error(`No element ${id}`);
  return element;
};

describe('a shape’s style traits', () => {
  it('sets each as a particularity of the element, and undoes it', () => {
    const outcome = ok(
      traitsOf('api', {
        borderWidth: 2.5,
        dash: 'dashed',
        cornerRadius: 12,
        opacity: 0.6,
        shadow: 'soft',
        gradient: { to: '#3e63dd', direction: 'down' },
      }),
    );
    expect(elementOf(outcome.state, 'api').appearance).toEqual({
      borderWidth: 2.5,
      dash: 'dashed',
      cornerRadius: 12,
      opacity: 0.6,
      shadow: 'soft',
      gradient: { to: '#3E63DD', direction: 'down' },
    });
    const resolved = appearanceOf(elementOf(outcome.state, 'api'), definitionsIn(outcome.state));
    expect(resolved).toMatchObject({
      borderWidth: 2.5,
      dash: 'dashed',
      cornerRadius: 12,
      opacity: 0.6,
      shadow: 'soft',
      gradient: { to: '#3E63DD', direction: 'down' },
    });
  });

  it('leaves what nothing sets to the drawing defaults: solid, opaque, and no border, radius, shadow or gradient of its own', () => {
    const state = colorProject();
    const resolved = appearanceOf(elementOf(state, 'api'), definitionsIn(state));
    expect(resolved.dash).toBe('solid');
    expect(resolved.opacity).toBe(1);
    expect(resolved.text).toEqual({});
    for (const key of ['borderWidth', 'cornerRadius', 'shadow', 'gradient'] as const) {
      expect(resolved).not.toHaveProperty(key);
    }
  });

  it('takes an inherited gradient away with none', () => {
    const base = resolveAppearance(
      [{ gradient: { to: '#3E63DD', direction: 'right' } }],
      ESSENCE.appearance,
    );
    expect(base.gradient).toEqual({ to: '#3E63DD', direction: 'right' });
    expect(resolveAppearance([{ gradient: 'none' }], base)).not.toHaveProperty('gradient');
  });

  it('refuses values outside their ranges and kinds', () => {
    expect(refusal(traitsOf('api', { opacity: 0.1 }))).toContain('opacity');
    expect(refusal(traitsOf('api', { borderWidth: 17 }))).toContain('border width');
    expect(refusal(traitsOf('api', { cornerRadius: -1 }))).toContain('corner radius');
    expect(refusal(traitsOf('api', { dash: 'wavy' }))).toContain('border');
    expect(refusal(traitsOf('api', { shadow: 'hard' }))).toContain('shadow');
    expect(refusal(traitsOf('api', { gradient: { to: '#3E63DD' } }))).toContain('gradient');
    expect(refusal(traitsOf('api', { gradient: { to: 'blue', direction: 'down' } }))).toContain(
      'gradient',
    );
  });

  it('takes a trait out with null, so that it is inherited again', () => {
    const set = ok(traitsOf('api', { opacity: 0.5, shadow: 'soft' }));
    const cleared = ok(traitsOf('api', { opacity: null }), set.state);
    expect(elementOf(cleared.state, 'api').appearance).toEqual({ shadow: 'soft' });
  });

  it('sets them on a component at the project’s level, which its elements inherit', () => {
    const outcome = ok({
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { cornerRadius: 20, text: { bold: true } },
    });
    const resolved = appearanceOf(elementOf(outcome.state, 'api'), definitionsIn(outcome.state));
    expect(resolved.cornerRadius).toBe(20);
    expect(resolved.text).toEqual({ bold: true });
  });
});

describe('how a shape writes the name', () => {
  it('changes it part by part, and leaves out what no part is left of', () => {
    const first = ok(traitsOf('api', { text: { bold: true, size: 16, color: '#1f2933' } }));
    expect(elementOf(first.state, 'api').appearance).toEqual({
      text: { bold: true, size: 16, color: '#1F2933' },
    });
    const second = ok(traitsOf('api', { text: { size: null, align: 'left' } }), first.state);
    expect(elementOf(second.state, 'api').appearance).toEqual({
      text: { bold: true, color: '#1F2933', align: 'left' },
    });
    const cleared = ok(
      traitsOf('api', { text: { bold: null, color: null, align: null } }),
      second.state,
    );
    expect(elementOf(cleared.state, 'api').appearance).toBeUndefined();
  });

  it('inherits each part on its own, nearest first', () => {
    const resolved = resolveAppearance(
      [{ text: { italic: true } }, { text: { italic: false, font: 'mono', size: 14 } }],
      ESSENCE.appearance,
    );
    expect(resolved.text).toEqual({ italic: true, font: 'mono', size: 14 });
  });

  it('keeps the spelling a file stored a color in when it is picked again', () => {
    const state = colorProject();
    const fromFile: ProjectSnapshot = {
      ...state,
      model: {
        ...state.model,
        elements: state.model.elements.map((each) =>
          each.id === 'api' ? { ...each, appearance: { text: { background: '#ffe8d6' } } } : each,
        ),
      },
    };
    const again = run(traitsOf('api', { text: { background: '#FFE8D6', bold: true } }), fromFile);
    if (!again.ok) throw new Error('Rejected');
    expect(elementOf(again.state, 'api').appearance?.text).toEqual({
      background: '#ffe8d6',
      bold: true,
    });
  });

  it('refuses parts it has not and values outside their ranges', () => {
    expect(refusal(traitsOf('api', { text: { weight: 700 } }))).toContain('"weight"');
    expect(refusal(traitsOf('api', { text: { size: 7 } }))).toContain('text size');
    expect(refusal(traitsOf('api', { text: { font: 'comic' } }))).toContain('roboto');
    expect(refusal(traitsOf('api', { text: { position: 'center' } }))).toContain('inside');
    expect(refusal(traitsOf('api', { text: { padding: 49 } }))).toContain('text padding');
    expect(refusal(traitsOf('api', { text: { wrap: 'yes' } }))).toContain('wraps its name');
  });

  const textStyles: fc.Arbitrary<TextStyle> = fc.record(
    {
      font: fc.constantFrom('roboto', 'system', 'mono'),
      size: fc.integer({ min: 8, max: 48 }),
      bold: fc.boolean(),
      italic: fc.boolean(),
      underline: fc.boolean(),
      align: fc.constantFrom('left', 'center', 'right'),
      position: fc.constantFrom('inside', 'above', 'below', 'left', 'right'),
      color: fc.constantFrom('#1F2933', '#FFFFFF', '#3E63DD'),
      background: fc.constantFrom('#FFF4E5', '#E5484D'),
      border: fc.constantFrom('#52606D', '#0F9688'),
      wrap: fc.boolean(),
      padding: fc.integer({ min: 0, max: 48 }),
    },
    { requiredKeys: [] },
  );

  it('stores any valid text as given, resolves it whole, and undoes it', () => {
    fc.assert(
      fc.property(textStyles, (text) => {
        const outcome = ok(traitsOf('api', { text }));
        const stored = elementOf(outcome.state, 'api').appearance;
        if (Object.keys(text).length === 0) expect(stored).toBeUndefined();
        else expect(stored).toEqual({ text });
        const resolved = appearanceOf(
          elementOf(outcome.state, 'api'),
          definitionsIn(outcome.state),
        );
        expect(resolved.text).toEqual(text);
      }),
      { numRuns: 60 },
    );
  });

  it('takes out exactly the parts given null, whatever else is set', () => {
    fc.assert(
      fc.property(textStyles, textStyles, (first, removed) => {
        const set = ok(traitsOf('api', { text: first }));
        const changes = Object.fromEntries(Object.keys(removed).map((key) => [key, null]));
        const after = ok(traitsOf('api', { text: changes }), set.state);
        const kept = Object.fromEntries(
          Object.entries(first).filter(([key]) => !Object.hasOwn(removed, key)),
        );
        const appearance: Appearance | undefined = elementOf(after.state, 'api').appearance;
        expect(appearance?.text ?? {}).toEqual(kept);
      }),
      { numRuns: 60 },
    );
  });
});

describe('a relation’s opacity', () => {
  it('is its own, its relation type’s, or 1', () => {
    const state = colorProject();
    const relation = state.model.relations.find((each) => each.id === 'books');
    if (relation === undefined) throw new Error('No relation');
    expect(relationAppearanceOf(relation, definitionsIn(state)).opacity).toBe(1);
    const outcome = ok({
      type: 'update-relation',
      id: 'books',
      changes: { appearanceTraits: { opacity: 0.4 } },
    });
    const changed = outcome.state.model.relations.find((each) => each.id === 'books');
    if (changed === undefined) throw new Error('No relation');
    expect(relationAppearanceOf(changed, definitionsIn(outcome.state)).opacity).toBe(0.4);
    expect(
      refusal({
        type: 'update-relation',
        id: 'books',
        changes: { appearanceTraits: { opacity: 2 } },
      }),
    ).toContain('opacity');
  });
});

describe('a shape’s turn and mirroring in a view', () => {
  const place = (extra: Record<string, unknown>): Command => ({
    type: 'set-positions',
    view: 'overview',
    positions: [{ element: 'api', x: 10, y: 20, width: 160, height: 72, pinned: true, ...extra }],
  });
  const positionOf = (state: ProjectSnapshot) =>
    state.views.find((view) => view.id === 'overview')?.positions.find((p) => p.element === 'api');

  it('stores a rotation from 0 up to 360 and a flip', () => {
    const outcome = ok(place({ rotation: -90, flip: 'horizontal' }));
    expect(positionOf(outcome.state)).toMatchObject({ rotation: 270, flip: 'horizontal' });
  });

  it('keeps them when a later position does not name them, as layout and moves do', () => {
    const turned = ok(place({ rotation: 45, flip: 'both' }));
    const moved = ok(place({ x: 300 }), turned.state);
    expect(positionOf(moved.state)).toMatchObject({ x: 300, rotation: 45, flip: 'both' });
  });

  it('takes them out with 0, a whole turn, and none', () => {
    const turned = ok(place({ rotation: 45, flip: 'vertical' }));
    const level = ok(place({ rotation: 720, flip: 'none' }), turned.state);
    const position = positionOf(level.state);
    expect(position).not.toHaveProperty('rotation');
    expect(position).not.toHaveProperty('flip');
  });

  it('refuses what is not a rotation or a flip', () => {
    expect(refusal(place({ rotation: 'left' }))).toContain('rotation');
    expect(refusal(place({ rotation: 4000 }))).toContain('rotation');
    expect(refusal(place({ flip: 'diagonal' }))).toContain('mirrored');
  });

  it('never lets a turn ride on another action as a placement', () => {
    const state = colorProject();
    const turn = place({ rotation: 90, pinned: false });
    const outcome = ok(turn, state);
    expect(placementJoins(state, outcome.state, turn)).toEqual({
      ok: false,
      why: 'it turns or flips a shape',
    });
  });
});

describe('the palette', () => {
  it('has twelve swatches, each reading at 3:1 on both canvases', () => {
    expect(PALETTE).toHaveLength(12);
    for (const { color } of PALETTE) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
      for (const canvas of Object.values(CANVAS_BACKGROUNDS)) {
        expect(contrastRatio(color, canvas)).toBeGreaterThanOrEqual(MINIMUM_MARK_CONTRAST);
      }
    }
  });

  it('keeps every two swatches told apart', () => {
    for (const [i, a] of PALETTE.entries()) {
      for (const b of PALETTE.slice(i + 1)) {
        expect(colorDifference(a.color, b.color)).toBeGreaterThanOrEqual(MINIMUM_COLOR_DIFFERENCE);
      }
    }
  });
});
