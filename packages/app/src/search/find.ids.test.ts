/** Search finds elements by their external identifiers (ADR 0056), as it finds them by id. */
import { definitionsIn, executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { translatorFor } from '../i18n/t';
import { loadSample } from '../test/sample';
import { find, indexProject } from './find';
import { matchedText } from './groups';

function withIds(): ProjectSnapshot {
  const outcome = executeCommand(loadSample(), {
    type: 'update-element',
    id: 'appointments-db',
    changes: { ids: { wikidata: 'Q8513', schema: 'Database' } },
  });
  if (!outcome.ok) throw new Error('The sample takes identifiers.');
  return outcome.state;
}

describe('search by external identifier', () => {
  const project = withIds();
  const index = indexProject(project, definitionsIn(project));

  it('finds an element by its identifier, and by its scheme and identifier', () => {
    for (const query of ['Q8513', 'q8513', 'wikidata:Q8513', 'wikidata q8513']) {
      const { found } = find(index, query);
      expect(found.map((each) => each.entry.id)).toEqual(['appointments-db']);
      expect(found[0]?.matched).toEqual({
        field: 'external-id',
        scheme: 'wikidata',
        identifier: 'Q8513',
      });
    }
  });

  it('says it found it by that identifier', () => {
    const [first] = find(index, 'Q8513').found;
    if (!first) throw new Error('It finds the DB.');
    expect(matchedText(translatorFor('en'), first)).toBe('wikidata identifier Q8513');
    expect(matchedText(translatorFor('es'), first)).toBe('identificador de wikidata Q8513');
  });

  it('finds nothing by an identifier no element has', () => {
    expect(find(index, 'Q999999').total).toBe(0);
  });
});
