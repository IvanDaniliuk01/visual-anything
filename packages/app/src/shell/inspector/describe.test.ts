import { definitionsOf, modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Relation } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, selectionOf } from '../../editor/selection';
import { loadSample } from '../../test/sample';
import { byPackage, countsOf, endName, relationLabel, relationSentence } from './describe';

const sample = loadSample();

/** The sample with a relation that ends on another relation, and one that ends on that. */
function withRelationsOnRelations(): ProjectSnapshot {
  const contract: Relation = {
    id: 'contract',
    relationType: 'systems.communicates-with',
    from: 'reminder-service',
    to: 'agent-to-api',
  };
  const audit: Relation = {
    id: 'audit',
    relationType: 'systems.communicates-with',
    from: 'patient',
    to: 'contract',
  };
  return {
    ...sample,
    model: { ...sample.model, relations: [...sample.model.relations, contract, audit] },
  };
}

describe('names in the inspector', () => {
  const project = withRelationsOnRelations();
  const index = modelIndexOf(project);
  const definitions = definitionsOf(project.packages);
  const relation = (id: string) => {
    const found = index.relation(id);
    if (!found) throw new Error(id);
    return found;
  };

  it('names an end by the element’s name, or the relation’s name or ends', () => {
    expect(endName(index, 'patient')).toBe('Patient');
    expect(endName(index, 'agent-to-api')).toBe('HTTPS');
    expect(endName(index, 'contract')).toBe('(Reminder service → HTTPS)');
    expect(endName(index, 'gone')).toBe('gone');
  });

  it('labels a relation by its name, or else its ends', () => {
    expect(relationLabel(index, relation('agent-to-api'))).toBe('HTTPS');
    expect(relationLabel(index, relation('patient-to-whatsapp'))).toBe(
      'Patient → WhatsApp channel',
    );
    expect(relationLabel(index, relation('audit'))).toBe('Patient → (Reminder service → HTTPS)');
  });

  it('puts a relation in words with its relation type', () => {
    expect(relationSentence(index, definitions, relation('api-in-scheduling'))).toBe(
      'Appointments API is part of Scheduling',
    );
    expect(relationSentence(index, definitions, relation('contract'))).toBe(
      'Reminder service communicates with HTTPS',
    );
  });
});

describe('countsOf', () => {
  it('counts what is selected, leaving out what none is selected of', () => {
    expect(
      countsOf(
        selectionOf([
          { kind: 'element', id: 'a' },
          { kind: 'element', id: 'b' },
          { kind: 'relation', id: 'c' },
          { kind: 'free-shape', id: 'd' },
        ]),
      ),
    ).toBe('2 elements, 1 relation and 1 free shape');
    expect(
      countsOf(
        selectionOf([
          { kind: 'relation', id: 'c' },
          { kind: 'relation', id: 'e' },
        ]),
      ),
    ).toBe('2 relations');
    expect(
      countsOf(
        selectionOf([
          { kind: 'element', id: 'a' },
          { kind: 'free-shape', id: 'd' },
          { kind: 'free-shape', id: 'f' },
        ]),
      ),
    ).toBe('1 element and 2 free shapes');
    expect(countsOf(EMPTY_SELECTION)).toBe('Nothing');
  });
});

describe('byPackage', () => {
  it('sorts the definitions by the package that defines them, in the order of the packages', () => {
    const definitions = definitionsOf(sample.packages);
    const offered = byPackage(definitions.components, sample.packages);
    expect(offered.map((from) => from.name)).toEqual(['Systems', 'Clinic']);
    expect(offered[0]?.members).toContain('systems.service');
    expect(offered[1]?.members).toEqual(['clinic.calendar']);
    const relationTypes = byPackage(definitions.relationTypes, sample.packages);
    expect(relationTypes[1]?.members).toEqual(['clinic.reminds']);
  });
});
