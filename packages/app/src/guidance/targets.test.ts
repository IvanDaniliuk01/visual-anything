import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
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

describe('revealKeyFor', () => {
  it('finds the first shape of an element, a relation or a free shape the view draws', () => {
    expect(revealKeyFor('whatsapp', scene)).toBe(keyOf('whatsapp'));
    expect(revealKeyFor('patient-to-whatsapp', scene)).toBe('patient-to-whatsapp');
    const note = scene.notes[0];
    if (note) expect(revealKeyFor(note.id, scene)).toBe(note.id);
    expect(revealKeyFor('nothing-like-it', scene)).toBeUndefined();
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
