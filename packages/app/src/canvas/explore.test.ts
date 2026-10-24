import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { loadSample } from '../test/sample';
import { withWovenRelations } from '../test/woven';
import {
  ALL_DEGREES,
  NO_FILTERS,
  applyFilters,
  endsOf,
  filterChoices,
  focusEmphasis,
  isFiltering,
  meetsCondition,
  reachedFrom,
  type AttributeCondition,
  type Filters,
  type FocusSettings,
  type FocusTargets,
} from './explore';
import { buildScene, type Scene } from './scene';

const sample = loadSample();
const VIEW = 'system-overview';
const scene = buildScene(sample, VIEW);

const PATIENT = 'patient';
const CLINIC = 'clinic-booking';
const WHATSAPP = 'clinic-booking/whatsapp';
const AGENT = 'clinic-booking/booking-agent';
const SCHEDULING = 'clinic-booking/scheduling';
const API = 'clinic-booking/scheduling/appointments-api';
const DB = 'clinic-booking/scheduling/appointments-db';
const REMINDERS = 'clinic-booking/scheduling/reminder-service';
const NOTE = 'calendar-note';

const SAMPLE_RELATIONS = [
  'patient-to-whatsapp',
  'whatsapp-to-agent',
  'agent-to-api',
  'api-reads-db',
  'api-writes-db',
  'api-to-reminders',
];

function filters(changes: Partial<Filters>): Filters {
  return { ...NO_FILTERS, ...changes };
}

function condition(changes: Partial<AttributeCondition>): AttributeCondition {
  return { of: 'elements', attribute: 'owner', test: 'is', value: '', ...changes };
}

function sorted(set: ReadonlySet<string> | undefined): string[] {
  return [...(set ?? [])].sort();
}

/** The sample with more relations, given as `[id, relation type, from, to]`. */
function withRelations(
  project: ProjectSnapshot,
  relations: [Id, Id, Id, Id, Record<string, string>?][],
): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      relations: [
        ...project.model.relations,
        ...relations.map(([id, relationType, from, to, attributes]) => ({
          id,
          relationType,
          from,
          to,
          ...(attributes ? { attributes } : {}),
        })),
      ],
    },
  };
}

describe('applyFilters', () => {
  it('filters nothing without filters', () => {
    expect(isFiltering(NO_FILTERS)).toBe(false);
    const result = applyFilters(scene, sample, NO_FILTERS);
    expect(result.hidden.size).toBe(0);
    expect(result.dimmed.size).toBe(0);
  });

  it('hides the shapes of a component, and the relations that end on them, and nothing else', () => {
    const result = applyFilters(
      scene,
      sample,
      filters({ components: new Set(['systems.service']) }),
    );
    expect(sorted(result.hidden)).toEqual(
      [API, REMINDERS, 'agent-to-api', 'api-reads-db', 'api-writes-db', 'api-to-reminders'].sort(),
    );
    expect(result.dimmed.size).toBe(0);
    expect(result.hiddenShapes).toBe(2);
    expect(result.hiddenRelations).toBe(4);
  });

  it('names the component an element is created from, not the ones it derives from', () => {
    // The Booking agent is an AI agent, which derives from Service.
    const result = applyFilters(
      scene,
      sample,
      filters({ components: new Set(['systems.service']) }),
    );
    expect(result.hidden.has(AGENT)).toBe(false);
  });

  it('keeps a container that holds a shape still shown, dimmed, but hides its own relations', () => {
    const project = withRelations(sample, [
      ['patient-uses-clinic', 'systems.communicates-with', 'patient', 'clinic-booking'],
    ]);
    const result = applyFilters(
      buildScene(project, VIEW),
      project,
      filters({ components: new Set(['systems.system']) }),
    );
    expect(sorted(result.dimmed)).toEqual([CLINIC, SCHEDULING]);
    expect(sorted(result.hidden)).toEqual(['patient-uses-clinic']);
    expect(result.hiddenShapes).toBe(0);
  });

  it('hides a container once nothing inside it is shown', () => {
    const result = applyFilters(
      scene,
      sample,
      filters({
        components: new Set([
          'systems.system',
          'systems.service',
          'clinic.calendar',
          'systems.ai-agent',
          'systems.chat-channel',
        ]),
      }),
    );
    // Only the Patient is left, so every relation loses an end.
    expect(sorted(result.hidden)).toEqual(
      [CLINIC, WHATSAPP, AGENT, SCHEDULING, API, DB, REMINDERS, ...SAMPLE_RELATIONS].sort(),
    );
    expect(result.dimmed.size).toBe(0);
  });

  it('hides the relations of a relation type, and the relations that end on them', () => {
    const woven = withWovenRelations(sample, 2);
    const result = applyFilters(
      buildScene(woven, VIEW),
      woven,
      filters({ relationTypes: new Set(['relates-to']) }),
    );
    expect(sorted(result.hidden)).toEqual(
      [0, 1, 2].flatMap((level) => ['a', 'b', 'c'].map((side) => `weave-${side}-${level}`)).sort(),
    );
    const communicates = applyFilters(
      scene,
      sample,
      filters({ relationTypes: new Set(['systems.communicates-with']) }),
    );
    expect(sorted(communicates.hidden)).toEqual(
      ['patient-to-whatsapp', 'whatsapp-to-agent', 'agent-to-api', 'api-to-reminders'].sort(),
    );
  });

  it('hides a relation that ends on a relation it hides, even when its own type is shown', () => {
    const project = withRelations(sample, [
      ['contract', 'relates-to', 'whatsapp-to-agent', 'appointments-api'],
    ]);
    const result = applyFilters(
      buildScene(project, VIEW),
      project,
      filters({ relationTypes: new Set(['systems.communicates-with']) }),
    );
    expect(result.hidden.has('contract')).toBe(true);
  });

  it('keeps only the elements that meet every condition on their attributes', () => {
    const result = applyFilters(
      scene,
      sample,
      filters({ conditions: [condition({ value: 'Scheduling team' })] }),
    );
    expect(sorted(result.hidden)).toEqual(
      [
        PATIENT,
        WHATSAPP,
        AGENT,
        DB,
        'patient-to-whatsapp',
        'whatsapp-to-agent',
        'agent-to-api',
        'api-reads-db',
        'api-writes-db',
      ].sort(),
    );
    expect(sorted(result.dimmed)).toEqual([CLINIC, SCHEDULING]);

    const both = applyFilters(
      scene,
      sample,
      filters({
        conditions: [
          condition({ value: 'scheduling TEAM' }),
          condition({ attribute: 'owner', test: 'is-not', value: 'Patient experience' }),
        ],
      }),
    );
    expect(both.hidden).toEqual(result.hidden);
  });

  it('reads the default a component gives when an element sets no value of its own', () => {
    const result = applyFilters(
      scene,
      sample,
      filters({
        conditions: [condition({ attribute: 'timezone', test: 'contains', value: 'buenos' })],
      }),
    );
    expect(result.hidden.has(DB)).toBe(false);
    expect(result.hidden.has(API)).toBe(true);
  });

  it('compares numbers as numbers', () => {
    const above = applyFilters(
      scene,
      sample,
      filters({ conditions: [condition({ attribute: 'sizeGb', test: 'above', value: '10' })] }),
    );
    expect(above.hidden.has(DB)).toBe(false);
    const below = applyFilters(
      scene,
      sample,
      filters({ conditions: [condition({ attribute: 'sizeGb', test: 'below', value: '10' })] }),
    );
    expect(below.hidden.has(DB)).toBe(true);
    const is = applyFilters(
      scene,
      sample,
      filters({ conditions: [condition({ attribute: 'sizeGb', test: 'is', value: '12.0' })] }),
    );
    expect(is.hidden.has(DB)).toBe(false);
  });

  it('tests relations by their own attributes, and leaves elements alone', () => {
    const project: ProjectSnapshot = {
      ...sample,
      model: {
        ...sample.model,
        relations: sample.model.relations.map((relation) =>
          relation.id === 'agent-to-api'
            ? { ...relation, attributes: { protocol: 'HTTPS' } }
            : relation,
        ),
      },
    };
    const result = applyFilters(
      buildScene(project, VIEW),
      project,
      filters({
        conditions: [condition({ of: 'relations', attribute: 'protocol', test: 'set' })],
      }),
    );
    expect(sorted(result.hidden)).toEqual(
      SAMPLE_RELATIONS.filter((id) => id !== 'agent-to-api').sort(),
    );
  });

  it('ignores a condition until it names an attribute and, when its test needs one, a value', () => {
    const unnamed = applyFilters(
      scene,
      sample,
      filters({ conditions: [condition({ attribute: '', test: 'set' })] }),
    );
    expect(unnamed.hidden.size).toBe(0);
    const valueless = applyFilters(
      scene,
      sample,
      filters({ conditions: [condition({ value: '  ' })] }),
    );
    expect(valueless.hidden.size).toBe(0);
    expect(isFiltering(filters({ conditions: [condition({ value: '' })] }))).toBe(false);
  });

  it('never hides free shapes', () => {
    const result = applyFilters(
      scene,
      sample,
      filters({ conditions: [condition({ attribute: 'nothing', test: 'set' })] }),
    );
    expect(result.hidden.has(NOTE)).toBe(false);
    expect(result.hiddenShapes).toBe(8);
  });
});

describe('meetsCondition', () => {
  it('tests whether an attribute has a value', () => {
    expect(meetsCondition('x', 'set', '')).toBe(true);
    expect(meetsCondition('', 'set', '')).toBe(false);
    expect(meetsCondition(undefined, 'set', '')).toBe(false);
    expect(meetsCondition(null, 'unset', '')).toBe(true);
    expect(meetsCondition(0, 'unset', '')).toBe(false);
  });

  it('compares text without minding case or the spaces around it', () => {
    expect(meetsCondition('Postgres', 'is', ' postgres ')).toBe(true);
    expect(meetsCondition('Postgres', 'is-not', 'postgres')).toBe(false);
    expect(meetsCondition(undefined, 'is-not', 'postgres')).toBe(true);
    expect(meetsCondition('WhatsApp Business', 'contains', 'app bus')).toBe(true);
    expect(meetsCondition(true, 'is', 'TRUE')).toBe(true);
    expect(meetsCondition({ a: 1 }, 'contains', '"a"')).toBe(true);
  });

  it('compares numbers only with numbers', () => {
    expect(meetsCondition(12, 'above', '9')).toBe(true);
    expect(meetsCondition('12', 'below', '100')).toBe(true);
    expect(meetsCondition('twelve', 'below', '100')).toBe(false);
    expect(meetsCondition(12, 'above', 'many')).toBe(false);
    expect(meetsCondition(undefined, 'above', '1')).toBe(false);
  });
});

const BOTH: FocusSettings = { degrees: 1, direction: 'both', isolate: false };

function on(elements: Id[], relations: Id[] = []): FocusTargets {
  return { elements: new Set(elements), relations: new Set(relations) };
}

function reached(
  targets: FocusTargets,
  settings: Partial<FocusSettings> = {},
  project: ProjectSnapshot = sample,
  hidden?: ReadonlySet<string>,
) {
  const found = reachedFrom(
    buildScene(project, VIEW),
    project,
    targets,
    { ...BOTH, ...settings },
    hidden,
  );
  return { elements: sorted(found.elements), relations: sorted(found.relations) };
}

describe('reachedFrom', () => {
  it('reaches what is one relation away from the selection, both ways', () => {
    expect(reached(on(['booking-agent']))).toEqual({
      elements: ['appointments-api', 'booking-agent', 'whatsapp'],
      relations: ['agent-to-api', 'whatsapp-to-agent'],
    });
  });

  it('reaches further by degrees, and everything that can be reached with every degree', () => {
    expect(reached(on(['booking-agent']), { degrees: 2 }).elements).toEqual([
      'appointments-api',
      'appointments-db',
      'booking-agent',
      'patient',
      'reminder-service',
      'whatsapp',
    ]);
    expect(reached(on(['patient']), { degrees: ALL_DEGREES }).relations).toEqual(
      [...SAMPLE_RELATIONS].sort(),
    );
  });

  it('follows only outgoing or only incoming relations when asked', () => {
    expect(reached(on(['booking-agent']), { direction: 'outgoing' })).toEqual({
      elements: ['appointments-api', 'booking-agent'],
      relations: ['agent-to-api'],
    });
    expect(reached(on(['booking-agent']), { direction: 'incoming' })).toEqual({
      elements: ['booking-agent', 'whatsapp'],
      relations: ['whatsapp-to-agent'],
    });
    expect(
      reached(on(['appointments-db']), { direction: 'incoming', degrees: ALL_DEGREES }).elements,
    ).toEqual(['appointments-api', 'appointments-db', 'booking-agent', 'patient', 'whatsapp']);
  });

  it('follows a relation that has no direction both ways, whichever way is asked', () => {
    const woven = withWovenRelations(sample, 0);
    expect(reached(on(['patient']), { direction: 'outgoing' }, woven).elements).toEqual([
      'booking-agent',
      'patient',
      'reminder-service',
      'whatsapp',
    ]);
  });

  it('takes in the relations between two things it reached, though it did not walk them', () => {
    const woven = withWovenRelations(sample, 0);
    // From the Patient, one degree reaches the Booking agent and the Reminder service, and the
    // relation between them comes with them.
    expect(reached(on(['patient']), {}, woven).relations).toContain('weave-b-0');
  });

  it('focuses on a selected relation and its ends, and walks on from them', () => {
    expect(reached(on([], ['agent-to-api']))).toEqual({
      elements: ['appointments-api', 'booking-agent'],
      relations: ['agent-to-api'],
    });
    expect(reached(on([], ['agent-to-api']), { direction: 'outgoing' })).toEqual({
      elements: ['appointments-api'],
      relations: ['agent-to-api'],
    });
  });

  it('reaches relations that end on a relation, and relations it ends on', () => {
    const woven = withWovenRelations(sample, 1);
    const fromA = reached(on([], ['weave-a-0']), {}, woven);
    // weave-a-1 runs from weave-a-0 to weave-b-0; weave-c-1 runs from weave-c-0 to weave-a-0.
    expect(fromA.relations).toEqual(expect.arrayContaining(['weave-a-1', 'weave-c-1']));
    expect(fromA.elements).toEqual(['booking-agent', 'patient']);
  });

  it('walks only along what the filters leave', () => {
    const hidden = new Set(['agent-to-api']);
    expect(reached(on(['booking-agent']), {}, sample, hidden)).toEqual({
      elements: ['booking-agent', 'whatsapp'],
      relations: ['whatsapp-to-agent'],
    });
  });

  it('starts only from what the view draws', () => {
    expect(reached(on(['no-such-element'], ['no-such-relation']))).toEqual({
      elements: [],
      relations: [],
    });
  });
});

function focus(
  targets: FocusTargets,
  settings: Partial<FocusSettings> = {},
  project: ProjectSnapshot = sample,
  hidden?: ReadonlySet<string>,
) {
  return focusEmphasis(
    buildScene(project, VIEW),
    project,
    targets,
    { ...BOTH, ...settings },
    hidden,
  );
}

describe('focusEmphasis', () => {
  it('dims everything the focus does not reach, free shapes too', () => {
    const emphasis = focus(on(['booking-agent']));
    expect(emphasis?.hidden).toBeUndefined();
    expect(sorted(emphasis?.dimmed)).toEqual(
      [
        PATIENT,
        CLINIC,
        SCHEDULING,
        DB,
        REMINDERS,
        NOTE,
        'patient-to-whatsapp',
        'api-reads-db',
        'api-writes-db',
        'api-to-reminders',
      ].sort(),
    );
  });

  it('dims or hides every copy of an element alike', () => {
    const project = withRelations(sample, [
      ['agent-in-scheduling', 'systems.is-part-of', 'booking-agent', 'scheduling'],
    ]);
    const emphasis = focus(on(['patient']), { isolate: true }, project);
    expect(emphasis?.hidden?.has(AGENT)).toBe(true);
    expect(emphasis?.hidden?.has(`${SCHEDULING}/booking-agent`)).toBe(true);
  });

  it('isolates: hides what it does not reach, and keeps the containers of what it reaches, dimmed', () => {
    const emphasis = focus(on(['appointments-api']), { isolate: true });
    expect(sorted(emphasis?.dimmed)).toEqual([CLINIC, SCHEDULING]);
    expect(sorted(emphasis?.hidden)).toEqual(
      [PATIENT, WHATSAPP, NOTE, 'patient-to-whatsapp', 'whatsapp-to-agent'].sort(),
    );
  });

  it('leaves what the filters hide to them', () => {
    const emphasis = focus(on(['booking-agent']), { isolate: true }, sample, new Set([PATIENT]));
    expect(emphasis?.hidden?.has(PATIENT)).toBe(false);
    expect(emphasis?.dimmed?.has(PATIENT)).toBe(false);
  });

  it('emphasizes nothing while it reaches nothing the view draws', () => {
    expect(focus(on([]))).toBeUndefined();
    expect(focus(on(['no-such-element']))).toBeUndefined();
  });
});

describe('filterChoices', () => {
  it('lists the components and relation types the view draws, with how many of each, by name', () => {
    const choices = filterChoices(scene, sample);
    expect(choices.components.map((each) => [each.name, each.count])).toEqual([
      ['AI agent', 1],
      ['Calendar', 1],
      ['Chat channel', 1],
      ['Person', 1],
      ['Service', 2],
      ['System', 2],
    ]);
    expect(choices.relationTypes.map((each) => [each.name, each.count])).toEqual([
      ['communicates with', 4],
      ['reads from', 1],
      ['writes to', 1],
    ]);
  });

  it('lists the attributes the elements and the relations it draws have, defined or their own', () => {
    const choices = filterChoices(scene, sample);
    expect(choices.attributes.elements).toEqual(
      expect.arrayContaining(['engine', 'owner', 'provider', 'sizeGb', 'timezone']),
    );
    // "communicates with" defines a protocol, though no relation of the sample sets one.
    expect(choices.attributes.relations).toEqual(['protocol']);
  });
});

describe('endsOf', () => {
  it('gives the two ends of a relation, each by the shape following it goes to', () => {
    expect(endsOf(scene, sample, 'agent-to-api')).toEqual({
      from: { id: 'booking-agent', kind: 'element', name: 'Booking agent', key: AGENT },
      to: { id: 'appointments-api', kind: 'element', name: 'Appointments API', key: API },
    });
  });

  it('goes to a relation that is an end through its line', () => {
    const project = withRelations(sample, [
      ['contract', 'relates-to', 'whatsapp-to-agent', 'appointments-api'],
    ]);
    expect(endsOf(buildScene(project, VIEW), project, 'contract').from).toEqual({
      id: 'whatsapp-to-agent',
      kind: 'relation',
      name: 'the relation',
      key: 'whatsapp-to-agent',
    });
  });

  it('goes to the first shape of an end that is not hidden, and leaves out a hidden end', () => {
    const project = withRelations(sample, [
      ['agent-in-scheduling', 'systems.is-part-of', 'booking-agent', 'scheduling'],
    ]);
    const twice = buildScene(project, VIEW);
    expect(endsOf(twice, project, 'agent-to-api', new Set([AGENT])).from?.key).toBe(
      `${SCHEDULING}/booking-agent`,
    );
    expect(endsOf(scene, sample, 'agent-to-api', new Set([API])).to).toBeUndefined();
    expect(endsOf(scene, sample, 'no-such-relation')).toEqual({});
  });
});

/** A view of the synthetic project, with fewer elements than the benchmark's. */
const synthetic = syntheticProject({ elements: 300, perSystem: 6, relationsPerElement: 2 });
const syntheticView = synthetic.views[0]?.id as Id;
const syntheticScene = buildScene(synthetic, syntheticView);
const components = [
  'systems.system',
  'systems.service',
  'systems.database',
  'systems.ai-agent',
  'systems.chat-channel',
];
const relationTypes = ['systems.communicates-with', 'systems.reads-from', 'systems.writes-to'];

const anyFilters: fc.Arbitrary<Filters> = fc.record({
  components: fc.subarray(components).map((ids) => new Set(ids)),
  relationTypes: fc.subarray(relationTypes).map((ids) => new Set(ids)),
  conditions: fc.constant([]),
});

/** For each relation drawn, its two ends: an element's shapes, or the relation it ends on. */
function drawnEndsOf(of: Scene, project: ProjectSnapshot): Map<Id, { keys: string[] }[]> {
  const shapes = new Map<Id, string[]>();
  for (const shape of of.shapes)
    shapes.set(shape.element, [...(shapes.get(shape.element) ?? []), shape.key]);
  const relations = new Map(project.model.relations.map((relation) => [relation.id, relation]));
  const ends = new Map<Id, { keys: string[] }[]>();
  for (const line of of.relations) {
    const relation = relations.get(line.relation);
    if (!relation) continue;
    ends.set(
      line.relation,
      [relation.from, relation.to].map((end) => ({ keys: shapes.get(end) ?? [end] })),
    );
  }
  return ends;
}

describe('filters and focus, on any choice', () => {
  const ends = drawnEndsOf(syntheticScene, synthetic);
  const containers = new Map(
    syntheticScene.shapes.map((shape) => [shape.key, shape.containerShape]),
  );
  const shown = (
    result: { hidden: ReadonlySet<string>; dimmed: ReadonlySet<string> },
    key: string,
  ) => !result.hidden.has(key);

  it('shows a relation only with both its ends shown and kept', () => {
    fc.assert(
      fc.property(anyFilters, (chosen) => {
        const result = applyFilters(syntheticScene, synthetic, chosen);
        for (const [relation, both] of ends) {
          if (!shown(result, relation)) continue;
          for (const end of both) {
            for (const key of end.keys) {
              expect(result.hidden.has(key) || result.dimmed.has(key)).toBe(false);
            }
          }
        }
      }),
      { numRuns: 30 },
    );
  });

  it('never hides the container of a shape it shows', () => {
    fc.assert(
      fc.property(anyFilters, (chosen) => {
        const result = applyFilters(syntheticScene, synthetic, chosen);
        for (const shape of syntheticScene.shapes) {
          if (result.hidden.has(shape.key)) continue;
          for (let up = containers.get(shape.key); up !== undefined; up = containers.get(up)) {
            expect(result.hidden.has(up)).toBe(false);
          }
        }
      }),
      { numRuns: 30 },
    );
  });

  const anyStart = fc.subarray(
    synthetic.model.elements.map((element) => element.id),
    {
      minLength: 1,
      maxLength: 3,
    },
  );

  it('reaches at least as much with one degree more', () => {
    fc.assert(
      fc.property(
        anyStart,
        fc.integer({ min: 1, max: 4 }),
        fc.constantFrom<FocusSettings['direction']>('both', 'outgoing', 'incoming'),
        (start, degrees, direction) => {
          const targets = on(start);
          const fewer = reachedFrom(syntheticScene, synthetic, targets, {
            ...BOTH,
            degrees,
            direction,
          });
          const more = reachedFrom(syntheticScene, synthetic, targets, {
            ...BOTH,
            degrees: degrees + 1,
            direction,
          });
          for (const id of fewer.elements) expect(more.elements.has(id)).toBe(true);
          for (const id of fewer.relations) expect(more.relations.has(id)).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('reaches both ways at least what it reaches outgoing and incoming', () => {
    fc.assert(
      fc.property(anyStart, fc.integer({ min: 1, max: 3 }), (start, degrees) => {
        const targets = on(start);
        const at = (direction: FocusSettings['direction']) =>
          reachedFrom(syntheticScene, synthetic, targets, { ...BOTH, degrees, direction });
        const both = at('both');
        for (const one of [at('outgoing'), at('incoming')]) {
          for (const id of one.elements) expect(both.elements.has(id)).toBe(true);
          for (const id of start) expect(one.elements.has(id)).toBe(true);
        }
      }),
      { numRuns: 30 },
    );
  });

  it('isolating hides or dims everything outside the focus, and never hides a container of it', () => {
    fc.assert(
      fc.property(anyStart, fc.integer({ min: 1, max: 3 }), (start, degrees) => {
        const targets = on(start);
        const settings: FocusSettings = { degrees, direction: 'both', isolate: true };
        const inFocus = reachedFrom(syntheticScene, synthetic, targets, settings);
        const emphasis = focusEmphasis(syntheticScene, synthetic, targets, settings);
        const hidden = emphasis?.hidden ?? new Set();
        const dimmed = emphasis?.dimmed ?? new Set();
        for (const shape of syntheticScene.shapes) {
          const focused = inFocus.elements.has(shape.element);
          expect(focused).toBe(!hidden.has(shape.key) && !dimmed.has(shape.key));
          if (!focused) continue;
          for (let up = containers.get(shape.key); up !== undefined; up = containers.get(up)) {
            expect(hidden.has(up)).toBe(false);
          }
        }
        for (const line of syntheticScene.relations) {
          expect(inFocus.relations.has(line.relation)).toBe(!hidden.has(line.relation));
        }
      }),
      { numRuns: 30 },
    );
  });
});
