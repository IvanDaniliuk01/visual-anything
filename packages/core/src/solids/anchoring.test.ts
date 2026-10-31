/**
 * Anchor parts… for solids (ADR 0075): a drawing with parts that shows a solid lists the solid's named
 * parts with the contents drawn as them, matches them by name, by id or by an external identifier
 * through a crosswalk, creates elements for the parts that match nothing when asked, in one action;
 * and replacing the solid says which anchored parts it loses, those anchored through their container
 * included. Property tests check that parts and contents pair at most once, and that anchoring again
 * anchors nothing.
 */
import type {
  Element,
  PackageFile,
  Relation,
  SolidDefinition,
  ViewFile,
} from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../commands';
import { anchoringCommand, type AnchorRequest } from '../images/anchoring';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds } from '../test/fixtures';
import {
  planSolidAnchoring,
  solidDrawingPartsOf,
  solidPartsLostByReplacing,
  type SolidAnchorPlan,
} from './index';

const PART_OF = 'robotics.part-of';
const VIEW = 'structure';
const ARM_ID = 'robotics.arm-k3f9q2';

/** A solid's definition with these parts, in depth-first order. */
function arm(parts: SolidDefinition['parts'], id = ARM_ID): SolidDefinition {
  return {
    id,
    name: 'Six-axis arm',
    hash: 'a'.repeat(64),
    bytes: 1000,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    counts: { triangles: 12, vertices: 8, nodes: parts.length, textures: 0 },
    parts,
    camera: { azimuth: 30, elevation: 20 },
  };
}

const ARM_PARTS: SolidDefinition['parts'] = [
  { name: 'base', point: { x: 0, y: 0, z: 0 } },
  { name: 'shoulder', parent: 0, point: { x: 0, y: 0.3, z: 0 } },
  { name: 'UBERON_0002084', parent: 1, point: { x: 0, y: 0.5, z: 0 } },
];

function robotics(extra: Partial<PackageFile> = {}): PackageFile {
  return {
    id: 'robotics',
    name: 'Robotics',
    components: [
      {
        id: 'robotics.robot',
        name: 'Robot',
        derivesFrom: 'essence',
        appearance: { solid: { solid: ARM_ID, placement: 'parts' } },
      },
      { id: 'robotics.link', name: 'Link', derivesFrom: 'essence' },
    ],
    relationTypes: [{ id: PART_OF, name: 'is part of', derivesFrom: 'relates-to', nests: true }],
    solids: [arm(ARM_PARTS)],
    ...extra,
  };
}

const inside = (from: string, to = 'robot'): Relation => ({
  id: `${from}-in-${to}`,
  relationType: PART_OF,
  from,
  to,
});

const content = (id: string, name: string, more: Partial<Element> = {}): Element => ({
  id,
  component: 'robotics.link',
  name,
  ...more,
});

/** A robot that shows the arm with its parts, holding the contents given. */
function robotWith(
  contents: Element[],
  options: { packages?: PackageFile[]; view?: Partial<ViewFile> } = {},
): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Robots', packages: ['robotics'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [{ id: 'robot', component: 'robotics.robot', name: 'Robot' }, ...contents],
      relations: contents.map((each) => inside(each.id)),
    },
    packages: options.packages ?? [robotics()],
    views: [
      {
        id: VIEW,
        name: 'Structure',
        perspective: { name: 'Parts' },
        nestingRelationTypes: [PART_OF],
        positions: [{ element: 'robot', x: 0, y: 0 }],
        freeShapes: [],
        ...options.view,
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

function planned(state: ProjectSnapshot, request: Partial<AnchorRequest> = {}): SolidAnchorPlan {
  const planning = planSolidAnchoring(state, {
    drawing: 'robot',
    matching: { by: 'name' },
    view: VIEW,
    ...request,
  });
  if (!planning.ok) throw new Error(planning.problem.message);
  return planning.plan;
}

function anchorsOf(plan: SolidAnchorPlan): Record<string, string> {
  return Object.fromEntries(
    plan.parts.flatMap(({ part, anchor }) => {
      if (anchor.kind === 'unmatched') return [];
      const what = anchor.kind === 'created' ? anchor.name : anchor.element.id;
      return [[part.id, `${anchor.kind} ${what}`]];
    }),
  );
}

function apply(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

describe('the parts of a drawing that shows a solid', () => {
  it('lists the solid’s parts in depth-first order, with the content drawn as each', () => {
    const state = robotWith([
      content('base', 'Base', { appearance: { part: { part: 'base' } } }),
      content('twin', 'Twin', { appearance: { part: { part: 'base', solid: ARM_ID } } }),
      content('other', 'Other', { appearance: { part: { part: 'shoulder', solid: 'x.other' } } }),
      content('picture', 'Picture', { appearance: { part: { part: 'shoulder', image: 'x.y' } } }),
    ]);
    const drawn = solidDrawingPartsOf(state, 'robot');
    expect(drawn?.solid).toEqual({ id: ARM_ID, name: 'Six-axis arm' });
    expect(drawn?.parts.map(({ part }) => part)).toEqual([
      { id: 'base', index: 0 },
      { id: 'shoulder', index: 1, parent: 0 },
      { id: 'UBERON_0002084', index: 2, parent: 1 },
    ]);
    expect(drawn?.parts.map(({ anchor }) => anchor.kind)).toEqual([
      'kept',
      'unmatched',
      'unmatched',
    ]);
    expect([...(drawn?.twins ?? [])]).toEqual([['twin', 'base']]);
    expect(drawn?.contents.map((each) => each.id)).toEqual(['base', 'twin', 'other', 'picture']);
  });

  it('is none for an element that shows no solid with its parts, or one no package defines', () => {
    expect(solidDrawingPartsOf(robotWith([]), 'world')).toBeUndefined();
    expect(solidDrawingPartsOf(robotWith([content('a', 'A')]), 'a')).toBeUndefined();
    const drawing = robotics().components[0] as PackageFile['components'][number];
    const asIcon = robotWith([], {
      packages: [
        robotics({
          components: [{ ...drawing, appearance: { solid: { solid: ARM_ID, placement: 'icon' } } }],
        }),
      ],
    });
    expect(solidDrawingPartsOf(asIcon, 'robot')).toBeUndefined();
    expect(
      solidDrawingPartsOf(robotWith([], { packages: [robotics({ solids: [] })] }), 'robot'),
    ).toBeUndefined();
  });
});

describe('planning Anchor parts… for a solid', () => {
  it('matches by name, whatever the case and separators, and anchors in one action', () => {
    const state = robotWith([content('s', 'Shoulder'), content('b', 'BASE')]);
    const plan = planned(state);
    expect(anchorsOf(plan)).toEqual({ base: 'matched b', shoulder: 'matched s' });
    expect(plan.anchors).toBe(2);
    const command = anchoringCommand(plan);
    expect(command?.label).toBe('Anchor 2 parts of "Robot"');
    const after = apply(state, command as Command);
    expect(after.model.elements.find((each) => each.id === 's')?.appearance?.part).toEqual({
      part: 'shoulder',
    });
    // Anchored now, so anchoring again anchors nothing.
    expect(planned(after).anchors).toBe(0);
  });

  it('matches by id, and by an external identifier read in a scheme', () => {
    const byId = robotWith([content('shoulder', 'Upper arm')]);
    expect(anchorsOf(planned(byId, { matching: { by: 'id' } }))).toEqual({
      shoulder: 'matched shoulder',
    });
    const external = robotWith([content('e', 'Elbow', { ids: { uberon: 'UBERON:0002084' } })]);
    expect(
      anchorsOf(planned(external, { matching: { by: 'external', scheme: 'uberon' } })),
    ).toEqual({ UBERON_0002084: 'matched e' });
  });

  it('creates an element inside the drawing for each part that matches nothing, when asked', () => {
    const state = robotWith([content('b', 'Base')]);
    const plan = planned(state, { create: { component: 'robotics.link' } });
    expect(anchorsOf(plan)).toEqual({
      base: 'matched b',
      shoulder: 'created Shoulder',
      UBERON_0002084: 'created UBERON 0002084',
    });
    const after = apply(state, anchoringCommand(plan) as Command);
    const made = after.model.elements.filter((each) => each.name === 'Shoulder');
    expect(made).toHaveLength(1);
    expect(made[0]?.appearance?.part).toEqual({ part: 'shoulder' });
    expect(
      after.model.relations.some((each) => each.from === made[0]?.id && each.to === 'robot'),
    ).toBe(true);
  });

  it('refuses a drawing that shows no solid with its parts, and a part the solid lacks', () => {
    const state = robotWith([content('a', 'A')]);
    const refused = planSolidAnchoring(state, { drawing: 'a', matching: { by: 'name' } });
    expect(refused.ok ? '' : refused.problem.message).toBe(
      'The element "A" is no drawing with parts: it does not show a solid with its parts.',
    );
    const unknown = planSolidAnchoring(state, {
      drawing: 'robot',
      matching: { by: 'name' },
      parts: ['wrist'],
    });
    expect(unknown.ok ? '' : unknown.problem.message).toBe(
      'The solid of "Robot" has no part "wrist".',
    );
  });

  it('pairs each part and each content at most once, and anchoring again anchors nothing', () => {
    const names = ['Base', 'base', 'Shoulder', 'shoulder', 'Elbow', 'UBERON 0002084', 'Other'];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...names), { maxLength: 8 }), (picked) => {
        const state = robotWith(picked.map((name, at) => content(`c${at}`, name)));
        const plan = planned(state);
        const paired = plan.parts.flatMap(({ anchor }) =>
          anchor.kind === 'matched' ? [anchor.element.id] : [],
        );
        expect(new Set(paired).size).toBe(paired.length);
        const command = anchoringCommand(plan);
        if (!command) return;
        expect(planned(apply(state, command)).anchors).toBe(0);
      }),
    );
  });
});

describe('the parts a replacement loses (ADR 0075)', () => {
  it('counts contents anchored through their container, as Anchor parts… anchors them', () => {
    const state = robotWith([
      content('b', 'Base', { appearance: { part: { part: 'base' } } }),
      content('s', 'Shoulder', { appearance: { part: { part: 'shoulder', solid: ARM_ID } } }),
      content('i', 'Pictured', { appearance: { part: { part: 'shoulder', image: 'x.y' } } }),
    ]);
    expect(solidPartsLostByReplacing(state, ARM_ID, [{ name: 'UBERON_0002084' }])).toEqual([
      { part: 'base', elements: ['b'] },
      { part: 'shoulder', elements: ['s'] },
    ]);
    expect(solidPartsLostByReplacing(state, ARM_ID, ARM_PARTS)).toEqual([]);
    // A part named alone, in a container that shows another solid, is not this solid's.
    expect(solidPartsLostByReplacing(state, 'robotics.other', [])).toEqual([]);
  });
});
