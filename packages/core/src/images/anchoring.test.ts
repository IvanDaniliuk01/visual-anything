/**
 * Anchor parts… in the core (ADR 0067): a drawing's parts and the contents drawn as them, matching by
 * name, by id and by an external identifier through crosswalks, creating what matches nothing, and the
 * one action that does it, with property tests that parts and contents pair at most once and that
 * anchoring again anchors nothing.
 */
import type { Element, PackageFile, Relation, ViewFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../commands';
import { appearanceOf } from '../definitions';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import { sequentialIds } from '../test/fixtures';
import {
  anchoringCommand,
  anchoringLabel,
  drawingPartsOf,
  identifiersOf,
  nameKey,
  partName,
  planAnchoring,
  type AnchorPlan,
  type AnchorRequest,
} from './anchoring';
import { HEART_PARTS, HEART_SVG } from './test/heart';
import { svgImage } from './test/project';
import { NS } from './test/svg-corpus';

const HEART = svgImage('clinic.heart', HEART_SVG, 'Heart');
const PART_OF = 'clinic.part-of';
const VIEW = 'anatomy';

function clinic(extra: Partial<PackageFile> = {}): PackageFile {
  return {
    id: 'clinic',
    name: 'Clinic',
    components: [
      {
        id: 'clinic.organ',
        name: 'Organ',
        derivesFrom: 'essence',
        appearance: { image: { image: HEART.id, placement: 'parts' } },
      },
      { id: 'clinic.chamber', name: 'Chamber', derivesFrom: 'essence' },
    ],
    relationTypes: [{ id: PART_OF, name: 'is part of', derivesFrom: 'relates-to', nests: true }],
    images: [HEART],
    ...extra,
  };
}

const inside = (from: string, to = 'heart'): Relation => ({
  id: `${from}-in-${to}`,
  relationType: PART_OF,
  from,
  to,
});

const content = (id: string, name: string, more: Partial<Element> = {}): Element => ({
  id,
  component: 'clinic.chamber',
  name,
  ...more,
});

/** A heart drawn with its parts, holding the contents given, in a view arranged by "is part of". */
function heartWith(
  contents: Element[],
  options: { packages?: PackageFile[]; view?: Partial<ViewFile> } = {},
): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Anatomy', packages: ['clinic'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [{ id: 'heart', component: 'clinic.organ', name: 'Heart' }, ...contents],
      relations: contents.map((each) => inside(each.id)),
    },
    packages: options.packages ?? [clinic()],
    views: [
      {
        id: VIEW,
        name: 'Anatomy',
        perspective: { name: 'Parts' },
        nestingRelationTypes: [PART_OF],
        positions: [{ element: 'heart', x: 0, y: 0 }],
        freeShapes: [],
        ...options.view,
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

function planned(state: ProjectSnapshot, request: Partial<AnchorRequest> = {}): AnchorPlan {
  const planning = planAnchoring(state, {
    drawing: 'heart',
    matching: { by: 'name' },
    view: VIEW,
    ...request,
  });
  if (!planning.ok) throw new Error(planning.problem.message);
  return planning.plan;
}

function refusal(state: ProjectSnapshot, request: Partial<AnchorRequest>): string {
  const planning = planAnchoring(state, {
    drawing: 'heart',
    matching: { by: 'name' },
    ...request,
  });
  if (planning.ok) throw new Error('It was planned.');
  return planning.problem.message;
}

/** The anchors of a plan by part, as `kind element` or `kind name`. */
function anchorsOf(plan: AnchorPlan): Record<string, string> {
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

describe('the parts of a drawing', () => {
  it('lists its picture’s parts in document order, with the content drawn as each', () => {
    const state = heartWith([
      content('lv', 'Left ventricle', { appearance: { part: { part: 'left-ventricle' } } }),
      content('twin', 'Twin', { appearance: { part: { part: 'left-ventricle' } } }),
      content('other', 'Other', { appearance: { part: { part: 'aorta', image: 'clinic.x' } } }),
      content('plain', 'Plain'),
    ]);
    const drawn = drawingPartsOf(state, 'heart');
    expect(drawn?.parts.map((each) => each.part.id)).toEqual([...HEART_PARTS]);
    expect(drawn?.parts.find((each) => each.part.id === 'left-ventricle')?.anchor).toEqual({
      kind: 'kept',
      element: { id: 'lv', name: 'Left ventricle' },
    });
    // A second content naming the same part is placed as an ordinary content.
    expect([...(drawn?.twins ?? [])]).toEqual([['twin', 'left-ventricle']]);
    // A part named in another picture is not this one's.
    expect(drawn?.parts.find((each) => each.part.id === 'aorta')?.anchor.kind).toBe('unmatched');
    expect(drawn?.contents.map((each) => each.id)).toEqual(['lv', 'twin', 'other', 'plain']);
    expect(drawn?.image).toMatchObject({ id: HEART.id, name: 'Heart' });
  });

  it('is none for an element that does not show its image with its parts', () => {
    const state = heartWith([content('lv', 'Left ventricle')]);
    expect(drawingPartsOf(state, 'lv')).toBeUndefined();
    expect(drawingPartsOf(state, 'world')).toBeUndefined();
    expect(drawingPartsOf(state, 'nothing')).toBeUndefined();
  });

  it('holds, in a view, only what the view’s nesting relation types put in it', () => {
    const state = heartWith([content('lv', 'Left ventricle')], {
      view: { nestingRelationTypes: [] },
    });
    expect(drawingPartsOf(state, 'heart', state.views[0])?.contents).toEqual([]);
    expect(drawingPartsOf(state, 'heart')?.contents).toHaveLength(1);
  });
});

describe('matching parts to contents', () => {
  it('by name, whatever the case, accents and separators', () => {
    const state = heartWith([
      content('a', 'Left ventricle'),
      content('b', 'RIGHT ATRIUM'),
      content('c', 'Séptum'),
      content('d', 'Nothing alike'),
    ]);
    const plan = planned(state);
    expect(anchorsOf(plan)).toEqual({
      'left-ventricle': 'matched a',
      'right-atrium': 'matched b',
      septum: 'matched c',
    });
    expect(plan.anchors).toBe(3);
    expect(nameKey('leftVentricle')).toBe(nameKey('left_ventricle'));
    expect(nameKey('Aurícula izquierda')).toBe('auricula izquierda');
  });

  it('keeps what is drawn as a part already, and pairs each part and each content once', () => {
    const state = heartWith([
      content('kept', 'Aorta', { appearance: { part: { part: 'left-ventricle' } } }),
      content('first', 'Aorta'),
      content('second', 'Aorta'),
      content('again', 'left ventricle'),
    ]);
    const plan = planned(state);
    // The first content in the model's order wins; the part drawn already keeps its content.
    expect(anchorsOf(plan)).toEqual({ 'left-ventricle': 'kept kept', aorta: 'matched first' });
    expect(plan.anchors).toBe(1);
  });

  it('by id, exactly', () => {
    const state = heartWith([content('aorta', 'Big vessel'), content('Septum', 'Wall')]);
    expect(anchorsOf(planned(state, { matching: { by: 'id' } }))).toEqual({
      aorta: 'matched aorta',
    });
  });

  it('only the parts asked for', () => {
    const state = heartWith([content('a', 'Aorta'), content('b', 'Septum')]);
    expect(anchorsOf(planned(state, { parts: ['septum'] }))).toEqual({ septum: 'matched b' });
  });

  it('by an external identifier, the part’s id read as one, through the crosswalks of the packages', () => {
    const atlas = svgImage(
      'clinic.atlas',
      `<svg viewBox="0 0 30 10" ${NS}><path id="UBERON_0002084" d="M0 0h10v10h-10z"/><path id="UBERON_0002078" d="M10 0h10v10h-10z"/><path id="FMA_7088" d="M20 0h10v10h-10z"/></svg>`,
      'Atlas',
    );
    const packages = [
      clinic({
        components: [
          {
            id: 'clinic.organ',
            name: 'Organ',
            derivesFrom: 'essence',
            appearance: { image: { image: atlas.id, placement: 'parts' } },
          },
          { id: 'clinic.chamber', name: 'Chamber', derivesFrom: 'essence' },
        ],
        images: [atlas],
        crosswalks: [{ from: 'uberon', to: 'fma', entries: { 'UBERON:0002078': 'FMA:7097' } }],
      }),
    ];
    const state = heartWith(
      [
        // Its identifier in the scheme read in.
        content('lv', 'Ventriculus sinister', { ids: { uberon: 'UBERON:0002084' } }),
        // Another scheme, which a crosswalk reaches.
        content('ra', 'Atrium dextrum', { ids: { fma: 'FMA:7097' } }),
        // The part's id as it is.
        content('heart-wall', 'Wall', { ids: { uberon: 'FMA_7088' } }),
      ],
      { packages },
    );
    expect(identifiersOf('UBERON_0002084')).toEqual(['UBERON_0002084', 'UBERON:0002084']);
    expect(anchorsOf(planned(state, { matching: { by: 'external', scheme: 'uberon' } }))).toEqual({
      UBERON_0002084: 'matched lv',
      UBERON_0002078: 'matched ra',
      FMA_7088: 'matched heart-wall',
    });
    // Read in a scheme nothing uses, nothing matches.
    expect(planned(state, { matching: { by: 'external', scheme: 'fma' } }).anchors).toBe(0);
  });
});

describe('creating what matches nothing', () => {
  it('makes an element of the component chosen, named after its part, inside the drawing', () => {
    const state = heartWith([content('a', 'Aorta')]);
    const plan = planned(state, {
      create: { component: 'clinic.chamber' },
      parts: ['aorta', 'left-ventricle'],
    });
    expect(anchorsOf(plan)).toEqual({
      aorta: 'matched a',
      'left-ventricle': 'created Left ventricle',
    });
    const command = anchoringCommand(plan);
    expect(command?.label).toBe('Anchor 2 parts of "Heart"');
    const after = apply(state, command as Command);
    const made = after.model.elements.find((each) => each.name === 'Left ventricle') as Element;
    expect(made.component).toBe('clinic.chamber');
    expect(made.appearance?.part).toEqual({ part: 'left-ventricle' });
    expect(after.model.relations).toContainEqual(
      expect.objectContaining({ relationType: PART_OF, from: made.id, to: 'heart' }),
    );
    expect(anchorsOf(planned(after, { parts: ['aorta', 'left-ventricle'] }))).toEqual({
      aorta: 'kept a',
      'left-ventricle': `kept ${made.id}`,
    });
  });

  it('gives what it creates the identifier its part reads as, when matching by one', () => {
    const atlas = svgImage(
      'clinic.atlas',
      `<svg viewBox="0 0 10 10" ${NS}><path id="UBERON_0002084" d="M0 0h10v10h-10z"/></svg>`,
    );
    const packages = [
      clinic({
        components: [
          {
            id: 'clinic.organ',
            name: 'Organ',
            derivesFrom: 'essence',
            appearance: { image: { image: atlas.id, placement: 'parts' } },
          },
          { id: 'clinic.chamber', name: 'Chamber', derivesFrom: 'essence' },
        ],
        images: [atlas],
      }),
    ];
    const state = heartWith([], { packages });
    const plan = planned(state, {
      matching: { by: 'external', scheme: 'uberon' },
      create: { component: 'clinic.chamber' },
    });
    const after = apply(state, anchoringCommand(plan) as Command);
    expect(after.model.elements.at(-1)).toMatchObject({
      name: 'UBERON 0002084',
      ids: { uberon: 'UBERON:0002084' },
      appearance: { part: { part: 'UBERON_0002084' } },
    });
  });

  it('makes the view nest by the relation type it puts them inside with, in the same action', () => {
    const state = heartWith([], { view: { nestingRelationTypes: [] } });
    const plan = planned(state, { create: { component: 'clinic.chamber' }, parts: ['aorta'] });
    expect(plan.viewNesting).toEqual([PART_OF]);
    const after = apply(state, anchoringCommand(plan) as Command);
    expect(after.views[0]?.nestingRelationTypes).toEqual([PART_OF]);
  });

  it('names parts by their words', () => {
    expect(partName('left_ventricle')).toBe('Left ventricle');
    expect(partName('leftVentricle')).toBe('Left ventricle');
    expect(partName('UBERON_0002084')).toBe('UBERON 0002084');
    expect(partName('LV')).toBe('LV');
    expect(partName('_')).toBe('_');
  });
});

describe('the action', () => {
  it('is one batch, labelled for the drawing, that draws each content as its part', () => {
    const state = heartWith([content('a', 'Aorta'), content('b', 'Septum')]);
    const plan = planned(state);
    const command = anchoringCommand(plan) as Command;
    expect(command).toMatchObject({ type: 'batch', label: 'Anchor 2 parts of "Heart"' });
    const outcome = executeCommand(state, command, { newId: sequentialIds() });
    if (!outcome.ok) throw new Error('refused');
    const definitions = definitionsIn(outcome.state);
    const element = (id: string) =>
      outcome.state.model.elements.find((each) => each.id === id) as Element;
    expect(appearanceOf(element('a'), definitions).part).toEqual({ part: 'aorta' });
    expect(appearanceOf(element('b'), definitions).part).toEqual({ part: 'septum' });
    // Undone, as one action.
    const undone = applyOperations(outcome.state, outcome.inverse).state;
    expect(undone.model).toEqual(state.model);
  });

  it('is none when nothing is anchored', () => {
    expect(anchoringCommand(planned(heartWith([content('a', 'Nothing alike')])))).toBeUndefined();
  });

  it('is labelled for one part and for many', () => {
    expect(anchoringLabel(1, 'Heart')).toBe('Anchor 1 part of "Heart"');
    expect(anchoringLabel(1200, 'Heart')).toBe('Anchor 1,200 parts of "Heart"');
  });
});

describe('what Anchor parts… refuses', () => {
  const state = heartWith([content('a', 'Aorta')]);

  it('says why', () => {
    expect(refusal(state, { drawing: 'nothing' })).toBe('There is no element "nothing".');
    expect(refusal(state, { drawing: 'a' })).toBe(
      'The element "Aorta" is no drawing with parts: it does not show an SVG image with its parts.',
    );
    expect(refusal(state, { view: 'gone' })).toBe('There is no view "gone".');
    expect(refusal(state, { matching: { by: 'external', scheme: 'Not a scheme' } })).toBe(
      'Parts are matched by an external identifier in a scheme, a short lowercase name such as "uberon"; "Not a scheme" is not one.',
    );
    expect(refusal(state, { parts: ['lung'] })).toBe('The picture of "Heart" has no part "lung".');
    expect(refusal(state, { create: { component: 'clinic.nothing' } })).toBe(
      'No package in use defines the component "clinic.nothing".',
    );
  });

  it('refuses to create where no nesting relation type can hold what it creates', () => {
    const lonely = { ...heartWith([]), views: [] };
    expect(refusal(lonely, { create: { component: 'clinic.chamber' } })).toBe(
      'No nesting relation type can hold a new element of "Chamber" inside "Heart".',
    );
  });
});

describe('Anchor parts…, for any contents', () => {
  /** Names that read as a part's id, or as nothing, written in many ways. */
  const spelled = fc.oneof(
    fc
      .tuple(fc.constantFrom(...HEART_PARTS), fc.constantFrom(' ', '_', '-', '.'), fc.boolean())
      .map(([id, separator, upper]) => {
        const name = id.split('-').join(separator);
        return upper ? name.toUpperCase() : name;
      }),
    fc.constantFrom('Nothing', 'Lung', 'Liver'),
  );
  const contents = fc.array(
    fc.record({
      name: spelled,
      anchored: fc.option(fc.constantFrom(...HEART_PARTS), { nil: undefined }),
    }),
    { maxLength: 24 },
  );

  it('pairs each part and each content at most once, and anchoring again anchors nothing', () => {
    fc.assert(
      fc.property(contents, fc.boolean(), (given, create) => {
        const state = heartWith(
          given.map((each, at) =>
            content(
              `c${at}`,
              each.name,
              each.anchored ? { appearance: { part: { part: each.anchored } } } : {},
            ),
          ),
        );
        const plan = planned(state, create ? { create: { component: 'clinic.chamber' } } : {});
        const elements = plan.parts.flatMap(({ anchor }) =>
          anchor.kind === 'kept' || anchor.kind === 'matched' ? [anchor.element.id] : [],
        );
        expect(new Set(elements).size).toBe(elements.length);
        expect(plan.anchors).toBe(
          plan.parts.filter(
            (each) => each.anchor.kind === 'matched' || each.anchor.kind === 'created',
          ).length,
        );
        if (create) expect(plan.parts.every((each) => each.anchor.kind !== 'unmatched')).toBe(true);
        // Each match reads alike.
        for (const { part, anchor } of plan.parts) {
          if (anchor.kind === 'matched')
            expect(nameKey(anchor.element.name)).toBe(nameKey(part.id));
        }
        const command = anchoringCommand(plan);
        if (!command) {
          expect(plan.anchors).toBe(0);
          return;
        }
        const after = apply(state, command);
        const again = planned(after, create ? { create: { component: 'clinic.chamber' } } : {});
        expect(again.anchors).toBe(0);
        // What was matched or created is drawn as its part now; what was kept still is.
        const definitions = definitionsIn(after);
        for (const { part, anchor } of again.parts) {
          const before = plan.parts.find((one) => one.part.id === part.id);
          if (before?.anchor.kind === 'unmatched') continue;
          expect(anchor.kind).toBe('kept');
          if (anchor.kind !== 'kept') continue;
          const kept = anchor.element.id;
          const element = after.model.elements.find((one) => one.id === kept);
          expect(element && appearanceOf(element, definitions).part?.part).toBe(part.id);
        }
      }),
      { numRuns: 60 },
    );
  });
});
