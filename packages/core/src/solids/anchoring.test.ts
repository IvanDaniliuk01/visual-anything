/**
 * Anchor parts… for solids in the core (ADR 0075): a drawing's solid parts and the contents drawn as
 * them, matching by name, by id and by an external identifier, creating what matches nothing, the one
 * action that does it, naming the solid, and the anchored parts a replacement loses; with a property
 * test that parts and contents pair at most once and that anchoring again anchors nothing.
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
import { appearanceOf } from '../definitions';
import { nameKey, planAnchoring, type AnchorRequest } from '../images/anchoring';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import { sequentialIds } from '../test/fixtures';
import {
  planSolidAnchoring,
  solidAnchoredElements,
  solidAnchoringCommand,
  solidDrawingPartsOf,
  solidPartsLostByReplacing,
  type SolidAnchorPlan,
} from './anchoring';

const ARM_ID = 'robotics.arm-k3f9q2';
const PART_OF = 'robotics.part-of';
const VIEW = 'structure';
const PARTS = ['base', 'shoulder', 'elbow', 'wrist', 'gripper'] as const;

const ARM: SolidDefinition = {
  id: ARM_ID,
  name: 'Arm',
  description: 'A five-part arm on a round base.',
  hash: 'a'.repeat(64),
  bytes: 1000,
  bounds: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } },
  counts: { triangles: 60, vertices: 40, nodes: 5, textures: 0 },
  parts: [
    { name: 'base', point: { x: 0, y: 0.1, z: 0 } },
    { name: 'shoulder', parent: 0, point: { x: 0, y: 0.5, z: 0 } },
    { name: 'elbow', parent: 1, point: { x: 0, y: 1, z: 0 } },
    { name: 'wrist', parent: 2, point: { x: 0, y: 1.5, z: 0 } },
    { name: 'gripper', parent: 3 },
  ],
  camera: { azimuth: 30, elevation: 20 },
};

const OTHER: SolidDefinition = {
  ...ARM,
  id: 'robotics.other-1',
  name: 'Other',
  hash: 'b'.repeat(64),
};

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
    solids: [ARM, OTHER],
    ...extra,
  };
}

const inside = (from: string, to = 'arm'): Relation => ({
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

/** An arm drawn with its solid's parts, holding the contents given, in a view nesting by "is part of". */
function armWith(
  contents: Element[],
  options: { view?: Partial<ViewFile>; arm?: Partial<Element> } = {},
): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Robots', packages: ['robotics'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'arm', component: 'robotics.robot', name: 'Arm', ...options.arm },
        ...contents,
      ],
      relations: contents.map((each) => inside(each.id)),
    },
    packages: [robotics()],
    views: [
      {
        id: VIEW,
        name: 'Structure',
        perspective: { name: 'Parts' },
        nestingRelationTypes: [PART_OF],
        positions: [{ element: 'arm', x: 0, y: 0 }],
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
    drawing: 'arm',
    matching: { by: 'name' },
    view: VIEW,
    ...request,
  });
  if (!planning.ok) throw new Error(planning.problem.message);
  return planning.plan;
}

function refusal(state: ProjectSnapshot, request: Partial<AnchorRequest>): string {
  const planning = planSolidAnchoring(state, {
    drawing: 'arm',
    matching: { by: 'name' },
    view: VIEW,
    ...request,
  });
  if (planning.ok) throw new Error('Planned.');
  return `${planning.problem.code}: ${planning.problem.message}`;
}

function apply(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

const anchorsOf = (plan: SolidAnchorPlan) =>
  plan.parts.map(({ part, anchor }) => [
    part.name,
    anchor.kind,
    anchor.kind === 'kept' || anchor.kind === 'matched' ? anchor.element.id : undefined,
  ]);

describe('the parts of a drawing that shows a solid', () => {
  it('lists the solid’s parts in depth-first order, with the content drawn as each', () => {
    const state = armWith([
      content('b', 'Base', { appearance: { part: { part: 'base', solid: ARM_ID } } }),
      content('s', 'Shoulder', { appearance: { part: { part: 'shoulder' } } }),
      content('twin', 'Twin', { appearance: { part: { part: 'shoulder' } } }),
      // A part of another solid, or of an image, is not one of this drawing's.
      content('o', 'Other', { appearance: { part: { part: 'elbow', solid: OTHER.id } } }),
      content('i', 'Image', { appearance: { part: { part: 'elbow', image: 'robotics.picture' } } }),
      content('plain', 'Wrist'),
    ]);
    const drawn = solidDrawingPartsOf(state, 'arm', state.views[0]);
    expect(drawn?.solid).toMatchObject({ id: ARM_ID, name: 'Arm' });
    expect(drawn?.parts.map(({ part, anchor }) => [part.name, part.index, anchor.kind])).toEqual([
      ['base', 0, 'kept'],
      ['shoulder', 1, 'kept'],
      ['elbow', 2, 'unmatched'],
      ['wrist', 3, 'unmatched'],
      ['gripper', 4, 'unmatched'],
    ]);
    expect([...(drawn?.twins ?? [])]).toEqual([['twin', 'shoulder']]);
    expect(drawn?.contents.map((each) => each.id)).toEqual(['b', 's', 'twin', 'o', 'i', 'plain']);
  });

  it('is no drawing of a solid when its element shows the solid as a picture, or no solid', () => {
    const asPicture = armWith([], {
      arm: { appearance: { solid: { solid: ARM_ID, placement: 'drawing' } } },
    });
    expect(solidDrawingPartsOf(asPicture, 'arm')).toBeUndefined();
    const undefinedSolid = armWith([], {
      arm: { appearance: { solid: { solid: 'robotics.gone', placement: 'parts' } } },
    });
    expect(solidDrawingPartsOf(undefinedSolid, 'arm')).toBeUndefined();
    expect(solidDrawingPartsOf(armWith([]), 'world')).toBeUndefined();
  });
});

describe('Anchor parts… for a solid', () => {
  it('matches parts to contents by name, whatever their case and separators', () => {
    const state = armWith([
      content('e', 'Elbow joint'),
      content('w', 'WRIST'),
      content('g', 'gripper'),
      content('w2', 'wrist'),
    ]);
    const plan = planned(state);
    expect(anchorsOf(plan)).toEqual([
      ['base', 'unmatched', undefined],
      ['shoulder', 'unmatched', undefined],
      ['elbow', 'unmatched', undefined],
      ['wrist', 'matched', 'w'],
      ['gripper', 'matched', 'g'],
    ]);
    expect(plan.anchors).toBe(2);
  });

  it('matches by id, and by an external identifier read with its first "_" as ":"', () => {
    const byId = planned(armWith([content('elbow', 'Third joint')]), { matching: { by: 'id' } });
    expect(anchorsOf(byId)[2]).toEqual(['elbow', 'matched', 'elbow']);

    const anatomy: SolidDefinition = {
      ...ARM,
      parts: [{ name: 'UBERON_0002084', point: { x: 0, y: 1, z: 0 } }],
    };
    const state = armWith([content('lv', 'Left ventricle', { ids: { uberon: 'UBERON:0002084' } })]);
    const withAnatomy: ProjectSnapshot = {
      ...state,
      packages: [robotics({ solids: [anatomy, OTHER] })],
    };
    const byExternal = planned(withAnatomy, { matching: { by: 'external', scheme: 'uberon' } });
    expect(anchorsOf(byExternal)).toEqual([['UBERON_0002084', 'matched', 'lv']]);
  });

  it('creates an element for each part that matches nothing, inside the drawing, when asked', () => {
    const state = armWith([content('b', 'Base')]);
    const plan = planned(state, { create: { component: 'robotics.link' } });
    expect(plan.parts.map((each) => each.anchor.kind)).toEqual([
      'matched',
      'created',
      'created',
      'created',
      'created',
    ]);
    expect(plan.nesting?.relationType).toBe(PART_OF);
    const command = solidAnchoringCommand(plan);
    expect(command?.label).toBe('Anchor 5 parts of "Arm"');
    const after = apply(state, command as Command);
    const created = after.model.elements.filter((each) => !['arm', 'b'].includes(each.id));
    expect(created.map((each) => [each.name, each.appearance?.part])).toEqual([
      ['Shoulder', { part: 'shoulder', solid: ARM_ID }],
      ['Elbow', { part: 'elbow', solid: ARM_ID }],
      ['Wrist', { part: 'wrist', solid: ARM_ID }],
      ['Gripper', { part: 'gripper', solid: ARM_ID }],
    ]);
    expect(
      after.model.relations.filter((each) => each.to === 'arm' && each.relationType === PART_OF),
    ).toHaveLength(5);
  });

  it('anchors as one undoable action, naming the solid, and anchoring again anchors nothing', () => {
    const before = armWith([content('e', 'Elbow'), content('w', 'Wrist')]);
    const plan = planned(before);
    const command = solidAnchoringCommand(plan) as Command;
    const outcome = executeCommand(before, command, { newId: sequentialIds() });
    if (!outcome.ok) throw new Error('Refused.');
    expect(outcome.label).toBe('Anchor 2 parts of "Arm"');
    const elbow = outcome.state.model.elements.find((each) => each.id === 'e');
    expect(elbow?.appearance?.part).toEqual({ part: 'elbow', solid: ARM_ID });
    expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(before);
    expect(planned(outcome.state).anchors).toBe(0);
    expect(solidAnchoringCommand(planned(outcome.state))).toBeUndefined();
  });

  it('anchors only the parts asked for', () => {
    const plan = planned(armWith([content('e', 'Elbow'), content('w', 'Wrist')]), {
      parts: ['wrist'],
    });
    expect(plan.anchors).toBe(1);
    expect(anchorsOf(plan)[3]).toEqual(['wrist', 'matched', 'w']);
  });

  it('refuses a drawing that shows no solid with its parts, a part it lacks, and an unknown view', () => {
    const state = armWith([content('e', 'Elbow')]);
    expect(refusal(state, { drawing: 'e' })).toBe(
      'invalid-command: The element "Elbow" is no drawing with parts of a solid: it does not show a solid with its parts.',
    );
    expect(refusal(state, { parts: ['tail'] })).toBe(
      'unknown-part: The solid of "Arm" has no part "tail".',
    );
    expect(refusal(state, { view: 'nowhere' })).toBe('unknown-view: There is no view "nowhere".');
    expect(refusal(state, { drawing: 'nobody' })).toBe(
      'unknown-element: There is no element "nobody".',
    );
    // The image's Anchor parts… still refuses a solid's drawing, which it does not draw.
    const image = planAnchoring(state, { drawing: 'arm', matching: { by: 'name' } });
    expect(image.ok).toBe(false);
  });
});

describe('the anchored parts of a solid', () => {
  const state = armWith([
    content('b', 'Base', { appearance: { part: { part: 'base', solid: ARM_ID } } }),
    // Anchored through its drawing, naming neither a solid nor an image.
    content('e', 'Elbow', { appearance: { part: { part: 'elbow' } } }),
    content('g', 'Gripper', { appearance: { part: { part: 'gripper', solid: OTHER.id } } }),
    content('n', 'None', { appearance: { part: 'none' } }),
  ]);

  it('are the elements naming the solid, and those naming neither inside a drawing that shows it', () => {
    expect(solidAnchoredElements(state).map(({ element, solids }) => [element.id, solids])).toEqual(
      [
        ['b', [ARM_ID]],
        ['e', [ARM_ID]],
        ['g', [OTHER.id]],
      ],
    );
  });

  it('are lost by a replacement whose file lacks them, through their drawings too', () => {
    expect(solidPartsLostByReplacing(state, ARM_ID, [{ name: 'shoulder' }])).toEqual([
      { part: 'base', elements: ['b'] },
      { part: 'elbow', elements: ['e'] },
    ]);
    expect(solidPartsLostByReplacing(state, ARM_ID, ARM.parts)).toEqual([]);
    expect(solidPartsLostByReplacing(state, OTHER.id, [])).toEqual([
      { part: 'gripper', elements: ['g'] },
    ]);
  });

  it('never count a part the solid already lacks as lost', () => {
    const unknown = armWith([
      content('t', 'Tail', { appearance: { part: { part: 'tail', solid: ARM_ID } } }),
    ]);
    expect(solidPartsLostByReplacing(unknown, ARM_ID, [])).toEqual([]);
  });
});

describe('Anchor parts… for a solid, for any contents', () => {
  const spelled = fc.oneof(
    fc
      .tuple(fc.constantFrom(...PARTS), fc.boolean())
      .map(([name, upper]) => (upper ? name.toUpperCase() : name)),
    fc.constantFrom('Nothing', 'Tail', 'Head'),
  );
  const contents = fc.array(
    fc.record({
      name: spelled,
      anchored: fc.option(fc.constantFrom(...PARTS), { nil: undefined }),
      named: fc.boolean(),
    }),
    { maxLength: 16 },
  );

  it('pairs each part and each content at most once, and anchoring again anchors nothing', () => {
    fc.assert(
      fc.property(contents, fc.boolean(), (given, create) => {
        const state = armWith(
          given.map((each, at) =>
            content(
              `c${at}`,
              each.name,
              each.anchored
                ? {
                    appearance: {
                      part: { part: each.anchored, ...(each.named ? { solid: ARM_ID } : {}) },
                    },
                  }
                : {},
            ),
          ),
        );
        const request = create ? { create: { component: 'robotics.link' } } : {};
        const plan = planned(state, request);
        const elements = plan.parts.flatMap(({ anchor }) =>
          anchor.kind === 'kept' || anchor.kind === 'matched' ? [anchor.element.id] : [],
        );
        expect(new Set(elements).size).toBe(elements.length);
        if (create) expect(plan.parts.every((each) => each.anchor.kind !== 'unmatched')).toBe(true);
        for (const { part, anchor } of plan.parts) {
          if (anchor.kind === 'matched')
            expect(nameKey(anchor.element.name)).toBe(nameKey(part.name));
        }
        const command = solidAnchoringCommand(plan);
        if (!command) {
          expect(plan.anchors).toBe(0);
          return;
        }
        const after = apply(state, command);
        expect(planned(after, request).anchors).toBe(0);
        const definitions = definitionsIn(after);
        for (const { part, anchor } of planned(after, request).parts) {
          if (anchor.kind !== 'kept') continue;
          const element = after.model.elements.find((one) => one.id === anchor.element.id);
          expect(element && appearanceOf(element, definitions).part?.part).toBe(part.name);
        }
      }),
      { numRuns: 60 },
    );
  });
});
