import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { emphasize } from '../canvas/emphasize';
import { buildScene } from '../canvas/scene';
import { t as currentT } from '../i18n';
import { loadSample } from '../test/sample';
import { describeMarks, guidanceEmphasis, revealKeyFor } from './targets';

const sample = loadSample();
const scene = buildScene(sample, 'system-overview');
const keyOf = (element: string) => {
  const shape = scene.shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape of ${element}.`);
  return shape.key;
};

/** The sample with a second "is part of", so that the API sits in two containers. */
function withTwoContainers(): ProjectSnapshot {
  return {
    ...sample,
    model: {
      ...sample.model,
      relations: [
        ...sample.model.relations,
        {
          id: 'api-in-clinic',
          relationType: 'systems.is-part-of',
          from: 'appointments-api',
          to: 'clinic-booking',
        },
      ],
    },
  };
}

describe('guidanceEmphasis', () => {
  it('highlights the shapes of the elements, relations and free shapes it names, and nothing else', () => {
    const emphasis = guidanceEmphasis(
      { kind: 'highlight', targets: ['patient', 'patient-to-whatsapp'], request: 1 },
      scene,
      sample,
    );
    expect(emphasis).toEqual({ highlighted: new Set([keyOf('patient'), 'patient-to-whatsapp']) });
  });

  it('highlights every shape of an element that sits in several containers', () => {
    const project = withTwoContainers();
    const twice = buildScene(project, 'system-overview');
    const keys = twice.shapes
      .filter((each) => each.element === 'appointments-api')
      .map((each) => each.key);
    expect(keys).toHaveLength(2);
    const emphasis = guidanceEmphasis(
      { kind: 'highlight', targets: ['appointments-api'], request: 1 },
      twice,
      project,
    );
    expect(emphasis?.highlighted).toEqual(new Set(keys));
  });

  it('ignores targets the view does not draw', () => {
    expect(
      guidanceEmphasis(
        { kind: 'highlight', targets: ['nothing-like-it'], request: 1 },
        scene,
        sample,
      ),
    ).toEqual({ highlighted: new Set() });
  });

  it('focuses on targets: they are highlighted, what connects to them kept, the rest dimmed', () => {
    const emphasis = guidanceEmphasis(
      { kind: 'focus', targets: ['whatsapp'], request: 1 },
      scene,
      sample,
    );
    expect(emphasis?.highlighted).toEqual(new Set([keyOf('whatsapp')]));
    const dimmed = emphasis?.dimmed ?? new Set();
    // Kept: WhatsApp, the relations on it and their other ends.
    for (const kept of [
      keyOf('whatsapp'),
      keyOf('patient'),
      keyOf('booking-agent'),
      'patient-to-whatsapp',
      'whatsapp-to-agent',
    ]) {
      expect(dimmed.has(kept)).toBe(false);
    }
    expect(dimmed.has(keyOf('appointments-db'))).toBe(true);
    expect(dimmed.has(keyOf('reminder-service'))).toBe(true);
    for (const line of scene.relations) {
      const touches =
        line.relation === 'patient-to-whatsapp' || line.relation === 'whatsapp-to-agent';
      if (!touches) expect(dimmed.has(line.relation)).toBe(true);
    }
  });

  it('keeps the ends of a relation it focuses on', () => {
    const emphasis = guidanceEmphasis(
      { kind: 'focus', targets: ['patient-to-whatsapp'], request: 1 },
      scene,
      sample,
    );
    expect(emphasis?.highlighted).toEqual(new Set(['patient-to-whatsapp']));
    expect(emphasis?.dimmed?.has(keyOf('patient'))).toBe(false);
    expect(emphasis?.dimmed?.has(keyOf('whatsapp'))).toBe(false);
    expect(emphasis?.dimmed?.has(keyOf('appointments-db'))).toBe(true);
  });
});

/** The sample with Scheduling collapsed: the API, the DB and the reminders sit hidden inside it. */
function withSchedulingCollapsed(): ProjectSnapshot {
  return {
    ...sample,
    views: sample.views.map((view) =>
      view.id === 'system-overview' ? { ...view, collapsed: ['scheduling'] } : view,
    ),
  };
}

describe('guidance on what a collapsed container hides (ADR 0031)', () => {
  const project = withSchedulingCollapsed();
  const closed = buildScene(project, 'system-overview');
  const scheduling = closed.shapes.find((each) => each.element === 'scheduling')?.key ?? '';

  it('highlights a hidden element through the outermost collapsed container that shows it', () => {
    expect(closed.shapes.some((each) => each.element === 'appointments-api')).toBe(false);
    const emphasis = guidanceEmphasis(
      { kind: 'highlight', targets: ['appointments-api'], request: 1 },
      closed,
      project,
    );
    expect(emphasize(closed, emphasis).highlighted.shapes.map((each) => each.key)).toEqual([
      scheduling,
    ]);
  });

  it('highlights a relation through the aggregated relation that stands for it', () => {
    const emphasis = guidanceEmphasis(
      { kind: 'highlight', targets: ['agent-to-api'], request: 1 },
      closed,
      project,
    );
    const lines = emphasize(closed, emphasis).highlighted.lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]?.aggregate?.relations).toContain('agent-to-api');
  });

  it('highlights a relation wholly inside the container through the container', () => {
    const emphasis = guidanceEmphasis(
      { kind: 'highlight', targets: ['api-reads-db'], request: 1 },
      closed,
      project,
    );
    expect(emphasize(closed, emphasis).highlighted.shapes.map((each) => each.key)).toEqual([
      scheduling,
    ]);
  });

  it('keeps what a hidden target connects to when it focuses, and dims the rest', () => {
    const emphasis = guidanceEmphasis(
      { kind: 'focus', targets: ['appointments-api'], request: 1 },
      closed,
      project,
    );
    const drawn = emphasize(closed, emphasis);
    const agent = closed.shapes.find((each) => each.element === 'booking-agent')?.key ?? '';
    const patient = closed.shapes.find((each) => each.element === 'patient')?.key ?? '';
    expect(drawn.highlighted.shapes.map((each) => each.key)).toEqual([scheduling]);
    expect(drawn.dimmed.shapes.has(scheduling)).toBe(false);
    expect(drawn.dimmed.shapes.has(agent)).toBe(false);
    expect(drawn.dimmed.shapes.has(patient)).toBe(true);
    const aggregate = closed.relations.find((line) =>
      line.aggregate?.relations.includes('agent-to-api'),
    );
    expect(aggregate && drawn.dimmed.relations.has(aggregate.relation)).toBe(false);
  });

  it('moves the canvas to what shows a hidden target', () => {
    expect(revealKeyFor('appointments-api', closed, project)).toBe(scheduling);
    expect(revealKeyFor('api-reads-db', closed, project)).toBe(scheduling);
    const aggregate = closed.relations.find((line) =>
      line.aggregate?.relations.includes('agent-to-api'),
    );
    expect(revealKeyFor('agent-to-api', closed, project)).toBe(aggregate?.relation);
  });

  it('counts only what the view shows, a hidden target through its container', () => {
    expect(
      describeMarks(
        { kind: 'highlight', targets: ['appointments-api', 'nothing-like-it'], request: 1 },
        project,
        currentT,
        closed,
      ),
    ).toBe('Claude highlights “Appointments API”.');
    expect(
      describeMarks(
        { kind: 'focus', targets: ['nothing-like-it'], request: 1 },
        project,
        currentT,
        closed,
      ),
    ).toBe('Claude focuses on nothing this view shows.');
  });
});

describe('revealKeyFor', () => {
  it('finds the first shape of an element, a relation or a free shape the view draws', () => {
    expect(revealKeyFor('whatsapp', scene, sample)).toBe(keyOf('whatsapp'));
    expect(revealKeyFor('patient-to-whatsapp', scene, sample)).toBe('patient-to-whatsapp');
    const note = scene.notes[0];
    if (note) expect(revealKeyFor(note.id, scene, sample)).toBe(note.id);
    expect(revealKeyFor('nothing-like-it', scene, sample)).toBeUndefined();
  });
});

describe('describeMarks', () => {
  it('says in words what Claude marked, by name', () => {
    expect(
      describeMarks({ kind: 'highlight', targets: ['patient', 'whatsapp'], request: 1 }, sample),
    ).toBe('Claude highlights “Patient” and “WhatsApp channel”.');
    expect(describeMarks({ kind: 'focus', targets: ['patient'], request: 1 }, sample)).toBe(
      'Claude focuses on “Patient”.',
    );
  });

  it('counts what goes beyond a few names', () => {
    const targets = ['patient', 'whatsapp', 'booking-agent', 'scheduling', 'appointments-api'];
    expect(describeMarks({ kind: 'highlight', targets, request: 1 }, sample)).toBe(
      'Claude highlights “Patient”, “WhatsApp channel”, “Booking agent” and 2 more.',
    );
  });
});
