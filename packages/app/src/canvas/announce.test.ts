import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, selectionOf } from '../editor/selection';
import { loadSample } from '../test/sample';
import { describeRelation, describeSelection, describeShape, nameOfEnd } from './announce';
import { indexScene } from './hit';
import { buildScene } from './scene';

const sample = loadSample();
const PLAIN = {
  bold: false,
  italic: false,
  strike: false,
  underline: false,
  code: false,
  highlight: false,
};
const indexed = indexScene(buildScene(sample, 'system-overview'));

function shape(key: string, within = indexed) {
  const found = within.byKey.get(key);
  if (!found) throw new Error(`The scene has no shape ${key}.`);
  return found;
}

describe('describeShape', () => {
  it('says the name, the component, the container and how many relations the view draws', () => {
    expect(
      describeShape(indexed, sample, shape('clinic-booking/scheduling/appointments-api')),
    ).toBe('Appointments API, Service, in Scheduling, 4 relations.');
    expect(describeShape(indexed, sample, shape('patient'))).toBe(
      'Patient, Person, in World, 1 relation.',
    );
    expect(describeShape(indexed, sample, shape('clinic-booking'))).toBe(
      'Clinic booking, System, in World, no relations.',
    );
  });

  it('says a detail that says more than the component, by its plain text (ADR 0082)', () => {
    const appointments = shape('clinic-booking/scheduling/appointments-api');
    const said = (detail: Partial<typeof appointments>) =>
      describeShape(indexed, sample, { ...appointments, ...detail });
    expect(said({ detail: 'Service' })).toBe(
      'Appointments API, Service, in Scheduling, 4 relations.',
    );
    expect(
      said({
        detail: 'Service · the **slots** table',
        detailRuns: [
          { text: 'Service · the ', ...PLAIN },
          { text: 'slots', ...PLAIN, bold: true },
          { text: ' table', ...PLAIN },
        ],
      }),
    ).toBe('Appointments API, Service, Service · the slots table, in Scheduling, 4 relations.');
  });

  it('says how many other containers an element sits in', () => {
    const twice: ProjectSnapshot = {
      ...sample,
      model: {
        ...sample.model,
        relations: [
          ...sample.model.relations,
          {
            id: 'reminders-in-clinic',
            relationType: 'systems.is-part-of',
            from: 'reminder-service',
            to: 'clinic-booking',
          },
        ],
      },
    };
    const scene = indexScene(buildScene(twice, 'system-overview'));
    expect(describeShape(scene, twice, shape('clinic-booking/reminder-service', scene))).toBe(
      'Reminder service, Service, in Clinic booking and 1 other container, 1 relation.',
    );
  });
});

describe('describeRelation', () => {
  it('reads as a sentence, from one end through the relation type to the other, with its name', () => {
    expect(describeRelation(sample, 'agent-to-api')).toBe(
      'Booking agent communicates with Appointments API, “HTTPS”.',
    );
  });

  it('says where the relation is among those of the element being stepped through', () => {
    expect(
      describeRelation(sample, 'whatsapp-to-agent', {
        element: 'booking-agent',
        position: 2,
        count: 2,
      }),
    ).toBe('WhatsApp channel communicates with Booking agent, relation 2 of 2 of Booking agent.');
  });

  it('says which relation it ends on, when it is reached through that one', () => {
    const onRelation: ProjectSnapshot = {
      ...sample,
      model: {
        ...sample.model,
        relations: [
          ...sample.model.relations,
          {
            id: 'about-reading',
            relationType: 'relates-to',
            from: 'api-reads-db',
            to: 'agent-to-api',
          },
        ],
      },
    };
    expect(
      describeRelation(onRelation, 'about-reading', {
        element: 'appointments-api',
        position: 4,
        count: 5,
        through: 'api-reads-db',
      }),
    ).toBe(
      'reads from relates to communicates with “HTTPS”, ending on Appointments API reads from Appointments DB, relation 4 of 5 of Appointments API.',
    );
  });

  it('says what a relation that no longer exists was', () => {
    expect(describeRelation(sample, 'gone')).toBe('A relation that no longer exists.');
  });
});

describe('nameOfEnd', () => {
  it('names an element by its name and a relation by the sentence it reads as', () => {
    expect(nameOfEnd(sample, 'patient')).toBe('Patient');
    expect(nameOfEnd(sample, 'patient-to-whatsapp')).toBe(
      'Patient communicates with WhatsApp channel',
    );
  });

  it('names a relation that ends on a relation without going round in circles', () => {
    const governed: ProjectSnapshot = {
      ...sample,
      model: {
        ...sample.model,
        relations: [
          ...sample.model.relations,
          { id: 'contract', relationType: 'relates-to', from: 'patient', to: 'agent-to-api' },
        ],
      },
    };
    expect(nameOfEnd(governed, 'contract')).toBe('Patient relates to communicates with “HTTPS”');
  });
});

describe('describeSelection', () => {
  it('says when nothing is selected', () => {
    expect(describeSelection(indexed, sample, EMPTY_SELECTION)).toBe('Nothing is selected.');
  });

  it('describes one element through the shape navigation reached', () => {
    const selection = selectionOf([{ kind: 'element', id: 'patient' }]);
    expect(describeSelection(indexed, sample, selection, 'patient')).toBe(
      'Patient, Person, in World, 1 relation.',
    );
  });

  it('describes one relation, and one free shape', () => {
    expect(
      describeSelection(indexed, sample, selectionOf([{ kind: 'relation', id: 'api-reads-db' }])),
    ).toBe('Appointments API reads from Appointments DB.');
    expect(
      describeSelection(
        indexed,
        sample,
        selectionOf([{ kind: 'free-shape', id: 'calendar-note' }]),
      ),
    ).toBe(
      'Note: Scheduling owns the calendar: only the Appointments API reads and writes the Appointments DB.',
    );
  });

  it('counts what a larger selection holds', () => {
    const selection = selectionOf([
      { kind: 'element', id: 'patient' },
      { kind: 'element', id: 'clinic-booking' },
      { kind: 'free-shape', id: 'calendar-note' },
    ]);
    expect(describeSelection(indexed, sample, selection)).toBe(
      '2 elements and 1 free shape selected.',
    );
  });
});
