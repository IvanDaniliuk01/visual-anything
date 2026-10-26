/**
 * Free geometry, named parts and automatic route styles in appearances, views and routes (M8b, ADR
 * 0066, ADR 0067, ADR 0069): the traits inherit, `none` takes them away, commands refuse what breaks
 * a rule, opening only warns, and a relation's automatic style comes from its appearance, then its
 * view, then orthogonal.
 */
import type { Appearance, FreeGeometry } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand, type Command } from './commands';
import { appearanceOf, relationAppearanceOf } from './definitions';
import { geometryFindings } from './geometry';
import { applyOperations } from './operations';
import type { ProblemCode } from './problems';
import { automaticRouteStyleOf, routeOf } from './routes';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn } from './state';
import { LOGO, imageProject } from './images/test/project';
import { colorProject, sequentialIds } from './test/fixtures';

const HEART: FreeGeometry = {
  width: 120,
  height: 110,
  keepProportions: true,
  outline: [
    {
      kind: 'path',
      d: 'M60 104 C20 76 0 52 0 30 C0 12 14 0 30 0 C44 0 54 8 60 20 C66 8 76 0 90 0 C106 0 120 12 120 30 C120 52 100 76 60 104 Z',
    },
  ],
  label: { x: 24, y: 30, width: 72, height: 36 },
};

function run(command: Command, state: ProjectSnapshot = colorProject()) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

function ok(command: Command, state: ProjectSnapshot = colorProject()): ProjectSnapshot {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome.state;
}

function refused(command: Command, state?: ProjectSnapshot): ProblemCode[] {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

const calendar = (appearance: Appearance | null): Command => ({
  type: 'set-component-appearance',
  component: 'clinic.calendar',
  appearance,
});

function element(state: ProjectSnapshot, id: string) {
  const found = state.model.elements.find((each) => each.id === id);
  if (!found) throw new Error(`No element ${id}`);
  return found;
}

describe('free geometry in an appearance (ADR 0066)', () => {
  it('is kept as written, inherited by elements, and taken away by none', () => {
    const shaped = ok(calendar({ geometry: HEART }));
    const definitions = definitionsIn(shaped);
    expect(appearanceOf(element(shaped, 'calendar'), definitions).geometry).toEqual(HEART);
    const own = ok(
      { type: 'update-element', id: 'calendar', changes: { appearance: { geometry: 'none' } } },
      shaped,
    );
    expect(appearanceOf(element(own, 'calendar'), definitionsIn(own)).geometry).toBeUndefined();
  });

  it('refuses what is not geometry, and geometry past a cap', () => {
    expect(
      refused(calendar({ geometry: { ...HEART, outline: [{ kind: 'path', d: 'M0 0 X1 1' }] } })),
    ).toEqual(['invalid-geometry']);
    expect(refused(calendar({ geometry: { ...HEART, width: 0 } }))).toEqual(['invalid-geometry']);
    const many = Array.from({ length: 65 }, () => ({
      kind: 'ellipse' as const,
      cx: 60,
      cy: 55,
      rx: 10,
      ry: 10,
    }));
    expect(refused(calendar({ geometry: { ...HEART, outline: many } }))).toEqual([
      'geometry-too-large',
    ]);
    expect(
      refused(calendar({ geometry: { ...HEART, extra: true } as unknown as FreeGeometry })),
    ).toEqual(['invalid-geometry']);
  });

  it('warns on opening about geometry that is not geometry, and draws it as its kind', () => {
    const state = colorProject();
    const broken: FreeGeometry = { ...HEART, outline: [{ kind: 'polygon', points: '0,0 1,1' }] };
    const written: ProjectSnapshot = {
      ...state,
      model: {
        ...state.model,
        elements: state.model.elements.map((each) =>
          each.id === 'calendar' ? { ...each, appearance: { geometry: broken } } : each,
        ),
      },
    };
    expect(checkProject(written).warnings.map((each) => each.code)).toContain('invalid-geometry');
    expect(geometryFindings(written).drawnAsKind.has(broken)).toBe(true);
  });

  it('warns about a model past the geometry it may hold, and draws what comes past it as its kind', () => {
    const state = colorProject();
    // About 31 KiB each, under a geometry's own cap, so that 70 of them pass the model's 2 MiB.
    const points = Array.from({ length: 1200 }, (_, at) => {
      const angle = (2 * Math.PI * at) / 1200;
      return `${(50 + 40 * Math.cos(angle)).toFixed(9)},${(50 + 40 * Math.sin(angle)).toFixed(9)}`;
    }).join(' ');
    const big: FreeGeometry[] = Array.from({ length: 70 }, () => ({
      width: 100,
      height: 100,
      outline: [{ kind: 'polygon', points }],
    }));
    const elements = big.map((geometry, at) => ({
      id: `shape-${at}`,
      component: 'systems.service',
      name: `Shape ${at}`,
      appearance: { geometry },
    }));
    const written: ProjectSnapshot = {
      ...state,
      model: { ...state.model, elements: [...state.model.elements, ...elements] },
    };
    const findings = geometryFindings(written);
    expect(findings.warnings.map((each) => each.code)).toContain('large-geometry');
    expect(findings.drawnAsKind.has(big[0] as FreeGeometry)).toBe(false);
    expect(findings.drawnAsKind.has(big.at(-1) as FreeGeometry)).toBe(true);
  });
});

describe('named parts in an appearance (ADR 0067)', () => {
  it('names a part by its id, with or without its image, and shows an image with its parts', () => {
    const images = imageProject();
    const shaped = ok(
      {
        type: 'update-element',
        id: 'booking',
        changes: { appearance: { part: { part: 'left-ventricle', image: LOGO.id } } },
      },
      images,
    );
    expect(appearanceOf(element(shaped, 'booking'), definitionsIn(shaped)).part).toEqual({
      part: 'left-ventricle',
      image: LOGO.id,
    });
    expect(refused(calendar({ part: { part: 'lv', image: 'heart' } }))).toEqual(['unknown-image']);
    ok(calendar({ part: { part: 'lv' } }));
    ok(calendar({ image: { image: LOGO.id, placement: 'parts' } }), imageProject());
    expect(refused(calendar({ part: { part: '1 bad' } }))).toEqual(['invalid-appearance']);
    expect(refused(calendar({ part: { part: 'lv', extra: 1 } as never }))).toEqual([
      'invalid-appearance',
    ]);
  });
});

describe('automatic route styles (ADR 0069)', () => {
  const reminds = (state: ProjectSnapshot) => {
    const found = state.model.relations.find((each) => each.id === 'reminds');
    if (!found) throw new Error('No relation');
    return found;
  };
  const view = (state: ProjectSnapshot) => state.views[0] as ProjectSnapshot['views'][number];

  it('takes the appearance’s route, then the view’s style, then orthogonal', () => {
    const state = colorProject();
    expect(automaticRouteStyleOf(state, view(state), reminds(state))).toBe('orthogonal');
    const curvedView = ok({
      type: 'update-view',
      id: 'overview',
      changes: { routeStyle: 'curved' },
    });
    expect(view(curvedView).routeStyle).toBe('curved');
    expect(automaticRouteStyleOf(curvedView, view(curvedView), reminds(curvedView))).toBe('curved');
    const straightType = ok(
      {
        type: 'set-relation-type-appearance',
        relationType: 'clinic.reminds',
        appearanceTraits: { route: 'straight' },
      },
      curvedView,
    );
    expect(relationAppearanceOf(reminds(straightType), definitionsIn(straightType)).route).toBe(
      'straight',
    );
    expect(automaticRouteStyleOf(straightType, view(straightType), reminds(straightType))).toBe(
      'straight',
    );
    // A relation's own orthogonal undoes its relation type's style.
    const own = ok(
      { type: 'update-relation', id: 'reminds', changes: { appearance: { route: 'orthogonal' } } },
      straightType,
    );
    expect(automaticRouteStyleOf(own, view(own), reminds(own))).toBe('orthogonal');
    const back = ok(
      { type: 'update-view', id: 'overview', changes: { routeStyle: null } },
      curvedView,
    );
    expect(view(back).routeStyle).toBeUndefined();
    expect(
      refused({ type: 'update-view', id: 'overview', changes: { routeStyle: 'zigzag' as never } }),
    ).toEqual(['invalid-command']);
    expect(
      refused({
        type: 'set-relation-type-appearance',
        relationType: 'clinic.reminds',
        appearanceTraits: { route: 'zigzag' as never },
      }),
    ).toEqual(['invalid-appearance']);
  });

  it('keeps a route’s style only where it differs from the automatic one, and a route without one takes it', () => {
    const curved = ok({ type: 'update-view', id: 'overview', changes: { routeStyle: 'curved' } });
    const same = ok(
      {
        type: 'set-route',
        view: 'overview',
        relation: 'reminds',
        style: 'curved',
        bendPoints: [{ x: 10, y: 10 }],
      },
      curved,
    );
    expect(view(same).routes?.reminds?.style).toBeUndefined();
    expect(routeOf(same, 'overview', 'reminds')?.style).toBe('curved');
    const orthogonal = ok(
      { type: 'set-route', view: 'overview', relation: 'reminds', style: 'orthogonal' },
      same,
    );
    expect(view(orthogonal).routes?.reminds?.style).toBe('orthogonal');
    expect(routeOf(orthogonal, 'overview', 'reminds')?.style).toBe('orthogonal');
  });
});
