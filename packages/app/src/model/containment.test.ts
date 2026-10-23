import type { ModelFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { containmentTree, type Placement } from './containment';

/** The tree as nested element ids, which is easier to read in an assertion. */
function outline(placements: Placement[]): unknown[] {
  return placements.map((placement) =>
    placement.contents.length > 0
      ? { [placement.element]: outline(placement.contents) }
      : placement.element,
  );
}

const isPartOf = (relationType: string) => relationType === 'systems.is-part-of';

function model(
  elements: string[],
  containment: [element: string, container: string][],
  relationType = 'p.in',
): ModelFile {
  return {
    world: { id: 'world', component: 'essence', name: 'World' },
    elements: elements.map((id) => ({ id, component: 'essence', name: id })),
    relations: containment.map(([from, to], index) => ({
      id: `r${index}`,
      relationType,
      from,
      to,
    })),
  };
}

const inP = (relationType: string) => relationType === 'p.in';

describe('containmentTree', () => {
  it('builds World’s contents from the nesting relations, the `to` end being the container', () => {
    const tree = containmentTree(loadSample().model, isPartOf);
    expect(outline(tree)).toEqual([
      'patient',
      {
        'clinic-booking': [
          'whatsapp',
          'booking-agent',
          { scheduling: ['appointments-api', 'appointments-db', 'reminder-service'] },
        ],
      },
    ]);
  });

  it('records the container each placement sits in', () => {
    const [patient, clinic] = containmentTree(loadSample().model, isPartOf);
    expect(patient?.container).toBeUndefined();
    expect(clinic?.contents.map((placement) => placement.container)).toEqual([
      'clinic-booking',
      'clinic-booking',
      'clinic-booking',
    ]);
  });

  it('ignores relations of other relation types', () => {
    const tree = containmentTree(loadSample().model, () => false);
    expect(tree).toHaveLength(8);
    expect(tree.every((placement) => placement.contents.length === 0)).toBe(true);
  });

  it('places an element with several containers inside each one', () => {
    const tree = containmentTree(
      model(
        ['region', 'circuit', 'neuron'],
        [
          ['neuron', 'region'],
          ['neuron', 'circuit'],
        ],
      ),
      inP,
    );
    expect(outline(tree)).toEqual([{ region: ['neuron'] }, { circuit: ['neuron'] }]);
  });

  it('places an element whose only container is World directly in World', () => {
    const tree = containmentTree(model(['a'], [['a', 'world']]), inP);
    expect(outline(tree)).toEqual(['a']);
  });

  it('breaks a containment cycle so that every element is placed and the tree ends', () => {
    const tree = containmentTree(
      model(
        ['a', 'b'],
        [
          ['a', 'b'],
          ['b', 'a'],
        ],
      ),
      inP,
    );
    expect(outline(tree)).toEqual([{ a: ['b'] }]);
  });
});
