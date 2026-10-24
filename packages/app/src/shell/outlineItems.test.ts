import { containmentTree, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import { drawnRelations } from '../canvas/navigation';
import { buildScene } from '../canvas/scene';
import { loadSample } from '../test/sample';
import { withWovenRelations } from '../test/woven';
import {
  outlineOf,
  textOf,
  worldTreeOf,
  type OutlineItem,
  type RelationItem,
} from './outlineItems';
import { outerIdsOf, shownRows } from './tree';

// The canvas's own relations, watched to see when the outline asks for them.
vi.mock('../canvas/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../canvas/navigation')>();
  return { ...actual, drawnRelations: vi.fn(actual.drawnRelations) };
});
const drawn = vi.mocked(drawnRelations);

const sample = loadSample();
const outline = outlineOf(buildScene(sample, 'system-overview'), sample);

function item(id: string, within = outline): OutlineItem {
  const found = shownRows(within, () => true).rows.find((row) => row.id === id);
  if (!found) throw new Error(`The outline has no row ${id}.`);
  return found.item;
}

const ids = (items: readonly OutlineItem[]) => items.map((each) => each.id);

describe('outlineOf', () => {
  it('puts World’s shapes at the top, then the view’s free shapes', () => {
    expect(ids(outline.top)).toEqual(['patient', 'clinic-booking', 'note:calendar-note']);
  });

  it('puts each container’s shapes inside its row, one row per shape', () => {
    expect(ids(outline.inside(item('clinic-booking')))).toEqual([
      'clinic-booking/whatsapp',
      'clinic-booking/booking-agent',
      'clinic-booking/scheduling',
    ]);
    expect(ids(outline.inside(item('clinic-booking/scheduling')))).toEqual([
      'clinic-booking/scheduling/appointments-api',
      'clinic-booking/scheduling/appointments-db',
      'clinic-booking/scheduling/reminder-service',
    ]);
  });

  it('puts a shape’s relations inside its row, clockwise from the top, each from its side', () => {
    const agent = item('clinic-booking/booking-agent');
    expect(outline.countInside(agent)).toBe(2);
    const relations = outline.inside(agent) as RelationItem[];
    expect(
      relations.map(({ relation, way, relationType, farName }) => ({
        relation,
        way,
        relationType,
        farName,
      })),
    ).toEqual([
      {
        relation: 'agent-to-api',
        way: 'out',
        relationType: 'communicates with',
        farName: 'Appointments API',
      },
      {
        relation: 'whatsapp-to-agent',
        way: 'in',
        relationType: 'communicates with',
        farName: 'WhatsApp channel',
      },
    ]);
    expect(relations[0]).toMatchObject({
      id: 'clinic-booking/booking-agent#agent-to-api',
      name: 'HTTPS',
      far: 'appointments-api',
      sentence: 'Booking agent communicates with Appointments API',
    });
  });

  it('puts a container’s relations before the shapes it holds', () => {
    const related: ProjectSnapshot = {
      ...sample,
      model: {
        ...sample.model,
        relations: [
          ...sample.model.relations,
          {
            id: 'patient-uses-clinic',
            relationType: 'relates-to',
            from: 'patient',
            to: 'clinic-booking',
          },
        ],
      },
    };
    const relatedOutline = outlineOf(buildScene(related, 'system-overview'), related);
    const inside = relatedOutline.inside(item('clinic-booking', relatedOutline));
    expect(ids(inside)[0]).toBe('clinic-booking#patient-uses-clinic');
    expect(inside[0]).toMatchObject({ way: 'both', farName: 'Patient' });
    expect(ids(inside).slice(1)).toEqual(ids(outline.inside(item('clinic-booking'))));
  });

  it('gives an element with several containers a row inside each, its relations under the first', () => {
    const twice = withSecondContainer(sample);
    const twiceOutline = outlineOf(buildScene(twice, 'system-overview'), twice);
    const inScheduling = item('clinic-booking/scheduling/reminder-service', twiceOutline);
    const inClinic = item('clinic-booking/reminder-service', twiceOutline);
    expect(ids(twiceOutline.inside(inScheduling))).toEqual([
      'clinic-booking/scheduling/reminder-service#api-to-reminders',
    ]);
    expect(twiceOutline.countInside(inClinic)).toBe(0);
  });

  it('opens the rows of containers at first, and closes the others', () => {
    expect(outline.openAtFirst(item('clinic-booking'))).toBe(true);
    expect(outline.openAtFirst(item('clinic-booking/booking-agent'))).toBe(false);
    const rows = shownRows(outline, (each) => outline.openAtFirst(each)).rows;
    expect(rows.map((row) => textOf(row.item))).toEqual([
      'Patient',
      'Clinic booking',
      'WhatsApp channel',
      'Booking agent',
      'Scheduling',
      'Appointments API',
      'Appointments DB',
      'Reminder service',
      'Note',
    ]);
  });

  it('finds the row that stands for something selected, and the rows around it', () => {
    expect(outline.placeOf({ kind: 'element', id: 'appointments-api' })).toEqual({
      id: 'clinic-booking/scheduling/appointments-api',
      outer: ['clinic-booking', 'clinic-booking/scheduling'],
    });
    expect(outline.placeOf({ kind: 'relation', id: 'agent-to-api' })).toEqual({
      id: 'clinic-booking/booking-agent#agent-to-api',
      outer: ['clinic-booking', 'clinic-booking/booking-agent'],
    });
    expect(outline.placeOf({ kind: 'free-shape', id: 'calendar-note' })).toEqual({
      id: 'note:calendar-note',
      outer: [],
    });
  });

  it('finds no row for what the view does not draw', () => {
    expect(outline.placeOf({ kind: 'relation', id: 'api-in-scheduling' })).toBeUndefined();
    expect(outline.placeOf({ kind: 'element', id: 'gone' })).toBeUndefined();
    expect(outline.placeOf({ kind: 'free-shape', id: 'gone' })).toBeUndefined();
  });

  it('finds the first shape of an element', () => {
    expect(outline.shapeOf('appointments-api')?.key).toBe(
      'clinic-booking/scheduling/appointments-api',
    );
    expect(outline.shapeOf('api-reads-db')).toBeUndefined();
  });
});

describe('outlineOf, for relations that end on relations', () => {
  const project: ProjectSnapshot = {
    ...sample,
    model: {
      ...sample.model,
      relations: [
        ...sample.model.relations,
        { id: 'between', relationType: 'relates-to', from: 'api-reads-db', to: 'api-writes-db' },
        {
          id: 'contract',
          relationType: 'systems.communicates-with',
          from: 'reminder-service',
          to: 'agent-to-api',
          name: 'Contract',
        },
      ],
    },
  };
  const related = outlineOf(buildScene(project, 'system-overview'), project);
  const api = 'clinic-booking/scheduling/appointments-api';
  const reads = `${api}#api-reads-db`;

  it('lists a relation between two relations inside the row of each relation it ends on', () => {
    const readsRow = item(reads, related);
    expect(related.countInside(readsRow)).toBe(1);
    expect(related.inside(readsRow)).toEqual([
      expect.objectContaining({
        kind: 'relation',
        id: `${reads}#between`,
        relation: 'between',
        near: 'api-reads-db',
        far: 'api-writes-db',
        way: 'both',
        farName: 'Appointments API writes to Appointments DB',
      }),
    ]);
    expect(ids(related.inside(item(`${api}#api-writes-db`, related)))).toEqual([
      `${api}#api-writes-db#between`,
    ]);
    // Inside the row of Appointments DB, at the other end of both relations, too.
    expect(
      ids(related.inside(item('clinic-booking/scheduling/appointments-db#api-reads-db', related))),
    ).toEqual(['clinic-booking/scheduling/appointments-db#api-reads-db#between']);
  });

  it('lists a relation from an element to a relation under both', () => {
    const agentToApi = item('clinic-booking/booking-agent#agent-to-api', related);
    expect(ids(related.inside(agentToApi))).toEqual([
      'clinic-booking/booking-agent#agent-to-api#contract',
    ]);
    expect(related.inside(agentToApi)[0]).toMatchObject({
      near: 'agent-to-api',
      far: 'reminder-service',
      way: 'in',
    });
    expect(
      ids(related.inside(item(`clinic-booking/scheduling/reminder-service`, related))),
    ).toContain('clinic-booking/scheduling/reminder-service#contract');
  });

  it('finds the row of a relation between two relations, inside the first one’s row', () => {
    expect(related.placeOf({ kind: 'relation', id: 'between' })).toEqual({
      id: `${reads}#between`,
      outer: ['clinic-booking', 'clinic-booking/scheduling', api, reads],
    });
    expect(related.placeOf({ kind: 'relation', id: 'contract' })).toEqual({
      id: 'clinic-booking/scheduling/reminder-service#contract',
      outer: [
        'clinic-booking',
        'clinic-booking/scheduling',
        'clinic-booking/scheduling/reminder-service',
      ],
    });
  });

  it('finds the row of a relation woven deep among relations at once', () => {
    // Every relation of a round ends on two of the round before: 2^40 ways back from the last.
    const rounds = 40;
    const woven = withWovenRelations(sample, rounds);
    const deep = outlineOf(buildScene(woven, 'system-overview'), woven);
    const started = performance.now();
    const place = deep.placeOf({ kind: 'relation', id: `weave-a-${rounds}` });
    expect(performance.now() - started).toBeLessThan(100);
    // Through the first relation of every round, back to the Patient's row.
    const through = Array.from({ length: rounds + 1 }, (_, round) => `weave-a-${round}`);
    expect(place?.id).toBe(['patient', ...through].join('#'));
    expect(place?.outer).toHaveLength(rounds + 1);
  });
});

describe('outlineOf, as the project changes', () => {
  it('is the same outline for a scene that keeps the parts the outline reads', () => {
    const scene = buildScene(sample, 'system-overview');
    const first = outlineOf(scene, sample);
    expect(outlineOf({ ...scene }, { ...sample })).toBe(first);
  });

  it('is a new outline once the model changes', () => {
    const scene = buildScene(sample, 'system-overview');
    const first = outlineOf(scene, sample);
    const changed = { ...sample, model: { ...sample.model } };
    expect(outlineOf(scene, changed)).not.toBe(first);
  });

  it('works out the order of the relations around a shape only once a row with relations is opened', () => {
    const scene = buildScene(sample, 'system-overview');
    const fresh = outlineOf(scene, { ...sample, model: { ...sample.model } });
    drawn.mockClear();
    const rows = shownRows(fresh, (each) => fresh.openAtFirst(each)).rows;
    expect(rows.find((row) => row.id === 'clinic-booking/booking-agent')?.opens).toBe(true);
    expect(drawn).not.toHaveBeenCalled();
    expect(fresh.inside(item('clinic-booking/booking-agent', fresh))).toHaveLength(2);
    expect(drawn).toHaveBeenCalled();
  });
});

describe('worldTreeOf', () => {
  const placements = containmentTree(sample.model, (relationType) =>
    relationType.endsWith('is-part-of'),
  );
  const world = worldTreeOf(placements);

  it('follows World’s containment, each row identified by the path to it', () => {
    expect(ids2(world.top)).toEqual(['patient', 'clinic-booking']);
    const clinic = world.top[1]!;
    expect(world.countInside(clinic)).toBe(3);
    expect(ids2(world.inside(clinic))).toEqual([
      'clinic-booking/whatsapp',
      'clinic-booking/booking-agent',
      'clinic-booking/scheduling',
    ]);
  });

  it('finds an element’s first row, and the rows around it', () => {
    expect(world.placeOf('appointments-db')).toEqual({
      id: 'clinic-booking/scheduling/appointments-db',
      outer: ['clinic-booking', 'clinic-booking/scheduling'],
    });
    expect(world.placeOf('gone')).toBeUndefined();
  });
});

describe('outerIdsOf', () => {
  it('lists the paths around a path, outermost first', () => {
    expect(outerIdsOf('a/b/c')).toEqual(['a', 'a/b']);
    expect(outerIdsOf('a')).toEqual([]);
  });
});

function ids2(items: readonly { id: string }[]): string[] {
  return items.map((each) => each.id);
}

/** The sample with the Reminder service inside Clinic booking too, so that it has two shapes. */
function withSecondContainer(project: ProjectSnapshot): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      relations: [
        ...project.model.relations,
        {
          id: 'reminders-in-clinic',
          relationType: 'systems.is-part-of',
          from: 'reminder-service',
          to: 'clinic-booking',
        },
      ],
    },
  };
}
