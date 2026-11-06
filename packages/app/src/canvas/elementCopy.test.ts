/**
 * Copy, Paste, Paste as duplicates and Duplicate (ADR 0103): what a copy holds, how strictly the
 * clipboard's text is read, and the one action each paste sends.
 */
import {
  executeCommand,
  shapesInView,
  shownByScope,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { selectionOf } from '../editor/selection';
import { loadSample } from '../test/sample';
import {
  COPIED_ELEMENTS,
  copiedText,
  copyOf,
  duplicateCommand,
  elementCopyShortcut,
  pasteAsDuplicatesCommand,
  pasteCommand,
  readCopied,
  type CopiedElements,
} from './elementCopy';
import { BESIDE_GAP } from './gestures';
import { indexScene } from './hit';
import { buildScene } from './scene';

const sample = loadSample();
const VIEW = 'system-overview';
const indexed = indexScene(buildScene(sample, VIEW));

function after(state: ProjectSnapshot, command: Command) {
  const outcome = executeCommand(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

/** The sample with a second view that shows only people. */
const withPeople = after(
  after(sample, {
    type: 'create-view',
    view: {
      id: 'people',
      name: 'People',
      perspective: { name: 'Who' },
      nestingRelationTypes: ['systems.is-part-of'],
    },
  }).state,
  {
    type: 'set-scope',
    view: 'people',
    scope: { include: [{ kind: 'component', component: 'systems.person' }] },
  },
).state;

function copied(elements: Id[], freeShapes: Id[] = []): CopiedElements {
  const made = copyOf(
    sample,
    VIEW,
    indexed,
    selectionOf([
      ...elements.map((id) => ({ kind: 'element' as const, id })),
      ...freeShapes.map((id) => ({ kind: 'free-shape' as const, id })),
    ]),
  );
  if ('reason' in made) throw new Error(made.reason);
  return made.copied;
}

const shapeOf = (id: Id) => indexed.byElement.get(id)?.[0];

describe('copyOf', () => {
  it('takes the elements, the relations among them, and where each sat', () => {
    const copy = copied(['patient', 'whatsapp']);
    expect(copy).toMatchObject({
      kind: COPIED_ELEMENTS,
      project: sample.project.name,
      view: VIEW,
      elements: ['patient', 'whatsapp'],
      relations: ['patient-to-whatsapp'],
    });
    const patient = shapeOf('patient')!;
    const whatsapp = shapeOf('whatsapp')!;
    const left = Math.min(patient.rect.x, whatsapp.rect.x);
    const top = Math.min(patient.rect.y, whatsapp.rect.y);
    expect(copy.arrangement).toEqual([
      { element: 'patient', x: patient.rect.x - left, y: patient.rect.y - top },
      { element: 'whatsapp', x: whatsapp.rect.x - left, y: whatsapp.rect.y - top },
    ]);
  });

  it('takes free shapes, placed relative to the copy', () => {
    const [note] = sample.views.find((view) => view.id === VIEW)?.freeShapes ?? [];
    if (!note || note.kind === 'arrow') throw new Error('The sample has no note first.');
    const copy = copied([], [note.id]);
    expect(copy.freeShapes).toEqual([{ ...note, x: 0, y: 0 }]);
  });

  it('says why when nothing it can copy is selected', () => {
    expect(copyOf(sample, VIEW, indexed, selectionOf([]))).toEqual({
      reason: 'Select elements or free shapes to copy them.',
    });
  });
});

describe('readCopied', () => {
  it('reads back what was copied', () => {
    const copy = copied(['patient', 'whatsapp']);
    expect(readCopied(copiedText(copy))).toEqual(copy);
  });

  it('reads nothing else as a copy', () => {
    const copy = copied(['patient']);
    expect(readCopied('Patient\nWhatsApp')).toBeUndefined();
    expect(readCopied(`{"kind": "${COPIED_ELEMENTS}"`)).toBeUndefined();
    expect(readCopied(JSON.stringify({ ...copy, kind: 'other' }))).toBeUndefined();
    expect(readCopied(JSON.stringify({ ...copy, elements: ['Not an id'] }))).toBeUndefined();
    expect(readCopied(JSON.stringify({ ...copy, elements: 'patient' }))).toBeUndefined();
    expect(
      readCopied(JSON.stringify({ ...copy, arrangement: [{ element: 'patient', x: 'far' }] })),
    ).toBeUndefined();
    expect(
      readCopied(JSON.stringify({ ...copy, freeShapes: [{ kind: 'script', src: 'x' }] })),
    ).toBeUndefined();
  });
});

describe('pasteCommand', () => {
  it('shows the same elements in a view that leaves them out, as one action', () => {
    const copy = copied(['clinic-booking', 'whatsapp']);
    const pasted = pasteCommand(withPeople, 'people', copy, { x: 1000, y: 500 });
    if ('reason' in pasted) throw new Error(pasted.reason);
    expect(pasted).toMatchObject({
      label: 'Paste 2 elements into "People"',
      elements: ['clinic-booking', 'whatsapp'],
      shown: 0,
      freeShapes: 0,
    });
    const { state } = after(withPeople, pasted.command!);
    const view = state.views.find((each) => each.id === 'people')!;
    const shown = shownByScope(state, view);
    expect(shown.element('clinic-booking') && shown.element('whatsapp')).toBe(true);
    // WhatsApp shows inside Clinic booking, which keeps it; only Clinic booking, in World, is placed.
    expect(shapesInView(state, view).containersOf('whatsapp')).toEqual(['clinic-booking']);
    const place = copy.arrangement.find((each) => each.element === 'clinic-booking')!;
    expect(view.positions).toEqual([
      { element: 'clinic-booking', x: 1000 + place.x, y: 500 + place.y },
    ]);
    // Containment never changes.
    expect(state.model).toBe(withPeople.model);
  });

  it('sends nothing for elements the view shows already', () => {
    const pasted = pasteCommand(sample, VIEW, copied(['patient', 'whatsapp']), { x: 0, y: 0 });
    expect(pasted).toEqual({ elements: ['patient', 'whatsapp'], shown: 2, freeShapes: 0 });
  });

  it('pastes free shapes as copies where the pointer is', () => {
    const [note] = sample.views.find((view) => view.id === VIEW)?.freeShapes ?? [];
    const pasted = pasteCommand(sample, VIEW, copied([], [note!.id]), { x: 70, y: 80 });
    if ('reason' in pasted) throw new Error(pasted.reason);
    const outcome = after(sample, pasted.command!);
    const made = outcome.state.views
      .find((view) => view.id === VIEW)
      ?.freeShapes.find((shape) => shape.id === outcome.created[0]);
    expect(made).toMatchObject({ kind: note!.kind, x: 70, y: 80 });
  });

  it('refuses a copy from another project, saying so', () => {
    const copy = { ...copied(['patient']), project: 'Another' };
    expect(pasteCommand(sample, VIEW, copy, { x: 0, y: 0 })).toEqual({
      reason:
        'These were copied from another project, “Another”, so they are not pasted: its components may not exist in this one.',
    });
    expect(pasteAsDuplicatesCommand(sample, VIEW, copy, { x: 0, y: 0 }, undefined)).toHaveProperty(
      'reason',
    );
  });

  it('says so when what was copied is gone', () => {
    const copy = { ...copied(['patient']), elements: ['gone'], arrangement: [] };
    expect(pasteCommand(sample, VIEW, copy, { x: 0, y: 0 })).toEqual({
      reason: 'What was copied is no longer in the project.',
    });
  });
});

describe('pasteAsDuplicatesCommand', () => {
  it('makes new elements inside the container under the pointer, in one action', () => {
    const copy = copied(['whatsapp', 'booking-agent']);
    const container = shapeOf('clinic-booking')!;
    const at = { x: container.rect.x + 100, y: container.rect.y + 300 };
    const made = pasteAsDuplicatesCommand(sample, VIEW, copy, at, container);
    if ('reason' in made) throw new Error(made.reason);
    expect(made.label).toBe('Duplicate 2 elements');
    const outcome = after(sample, made.command);
    const [whatsapp, agent] = outcome.created;
    const elements = outcome.state.model.elements;
    // They land in the container their originals sit in: each says it is a copy.
    expect(elements.find((each) => each.id === whatsapp)?.name).toBe('WhatsApp channel (copy)');
    expect(elements.find((each) => each.id === agent)?.name).toBe('Booking agent (copy)');
    // "whatsapp to agent" runs between the duplicates.
    expect(outcome.state.model.relations).toContainEqual(
      expect.objectContaining({
        from: whatsapp,
        to: agent,
        relationType: 'systems.communicates-with',
      }),
    );
    const place = copy.arrangement.find((each) => each.element === 'whatsapp')!;
    expect(
      outcome.state.views
        .find((view) => view.id === VIEW)
        ?.positions.find((each) => each.element === whatsapp),
    ).toEqual({
      element: whatsapp,
      container: 'clinic-booking',
      x: 100 + place.x,
      y: 300 + place.y,
    });
  });

  it('makes them in World where no container is under the pointer', () => {
    const made = pasteAsDuplicatesCommand(
      sample,
      VIEW,
      copied(['whatsapp']),
      { x: -900, y: 0 },
      undefined,
    );
    if ('reason' in made) throw new Error(made.reason);
    const outcome = after(sample, made.command);
    const [whatsapp] = outcome.created;
    expect(outcome.state.model.elements.find((each) => each.id === whatsapp)?.name).toBe(
      'WhatsApp channel',
    );
    expect(outcome.state.model.relations.some((each) => each.from === whatsapp)).toBe(false);
  });
});

describe('duplicateCommand', () => {
  it('duplicates the selection beside itself, with what it holds, as one action', () => {
    const made = duplicateCommand(
      sample,
      VIEW,
      indexed,
      selectionOf([{ kind: 'element', id: 'scheduling' }]),
    );
    if ('reason' in made) throw new Error(made.reason);
    expect(made.label).toBe('Duplicate 1 element');
    const outcome = after(sample, made.command);
    const [scheduling] = outcome.created;
    const { elements, relations } = outcome.state.model;
    expect(elements.find((each) => each.id === scheduling)?.name).toBe('Scheduling (copy)');
    expect(relations).toContainEqual(
      expect.objectContaining({
        from: scheduling,
        to: 'clinic-booking',
        relationType: 'systems.is-part-of',
      }),
    );
    // Its API, database and reminder service come along, inside it.
    expect(relations.filter((each) => each.to === scheduling)).toHaveLength(3);
    const shape = shapeOf('scheduling')!;
    expect(
      outcome.state.views
        .find((view) => view.id === VIEW)
        ?.positions.find((each) => each.element === scheduling),
    ).toMatchObject({
      container: 'clinic-booking',
      x: Math.round(shape.offset.x + shape.rect.width + BESIDE_GAP),
      y: Math.round(shape.offset.y),
    });
  });

  it('says why when nothing it can duplicate is selected', () => {
    expect(duplicateCommand(sample, VIEW, indexed, selectionOf([]))).toEqual({
      reason: 'Select elements or free shapes to duplicate them.',
    });
  });
});

describe('elementCopyShortcut', () => {
  const press = (
    code: string,
    more: { shiftKey?: boolean; altKey?: boolean; metaKey?: boolean },
  ) => ({
    code,
    ctrlKey: more.metaKey !== true,
    metaKey: more.metaKey === true,
    altKey: more.altKey === true,
    shiftKey: more.shiftKey === true,
  });

  it('reads Ctrl+D and Ctrl+Shift+V, ⌘D and ⇧⌘V, by the key’s place', () => {
    expect(elementCopyShortcut(press('KeyD', {}))).toBe('duplicate');
    expect(elementCopyShortcut(press('KeyD', { metaKey: true }))).toBe('duplicate');
    expect(elementCopyShortcut(press('KeyV', { shiftKey: true }))).toBe('paste-as-duplicates');
  });

  it('leaves Copy and Paste to the browser’s events, and appearance’s keys alone', () => {
    expect(elementCopyShortcut(press('KeyV', {}))).toBeUndefined();
    expect(elementCopyShortcut(press('KeyC', {}))).toBeUndefined();
    expect(elementCopyShortcut(press('KeyV', { altKey: true }))).toBeUndefined();
    expect(elementCopyShortcut(press('KeyD', { shiftKey: true }))).toBeUndefined();
    expect(elementCopyShortcut({ ...press('KeyD', {}), ctrlKey: false })).toBeUndefined();
  });
});
