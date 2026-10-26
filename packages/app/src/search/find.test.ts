import { definitionsIn, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { loadSample } from '../test/sample';
import { IndexBuilder, find, indexProject, normalized, type FindIndex, type Found } from './find';
import { cpuNow } from '../test/cpu';

const sample = loadSample();
const index = indexProject(sample, definitionsIn(sample));

/** What a search finds, as kind and id, in the order it lists them. */
function ids(query: string, project: ProjectSnapshot = sample): string[] {
  const found = find(
    project === sample ? index : indexProject(project, definitionsIn(project)),
    query,
  );
  return found.found.map(({ entry }) => `${entry.kind}:${entry.id}`);
}

function first(query: string): Found | undefined {
  return find(index, query).found[0];
}

describe('normalized', () => {
  it('ignores case, accents and the spaces around', () => {
    expect(normalized('  Relación  ÁGIL ')).toBe('relacion agil');
    expect(normalized('Ñandú')).toBe('nandu');
  });
});

describe('find', () => {
  it('finds nothing for an empty query', () => {
    expect(find(index, '   ')).toEqual({ found: [], total: 0 });
  });

  it('finds elements by name, the closest names first', () => {
    expect(ids('appointments')).toEqual([
      'element:appointments-api',
      'element:appointments-db',
      // The note only mentions them.
      'free-shape:calendar-note',
    ]);
    expect(first('Patient')?.entry.id).toBe('patient');
    expect(first('patient')?.matched).toEqual({ field: 'name' });
  });

  it('finds by id, by component, also by its Spanish name, and by attribute value', () => {
    expect(first('reminder-service')?.entry.id).toBe('reminder-service');
    expect(ids('ai agent')).toContain('element:booking-agent');
    expect(first('ai agent')?.matched).toEqual({ field: 'definition' });
    // "Agente de IA" is AI agent's Spanish name; "Servicio" is Service's.
    expect(ids('agente de ia')).toContain('element:booking-agent');
    expect(ids('servicio')).toEqual(
      expect.arrayContaining(['element:appointments-api', 'element:reminder-service']),
    );
    expect(ids('scheduling team')).toEqual(
      expect.arrayContaining(['element:appointments-api', 'element:reminder-service']),
    );
    expect(find(index, 'postgres').found[0]?.matched).toEqual({
      field: 'attribute',
      attribute: 'engine',
      value: 'postgres',
    });
  });

  it('finds relations by name and relation type, and notes by their text', () => {
    expect(ids('https')).toContain('relation:agent-to-api');
    expect(ids('reads from')).toContain('relation:api-reads-db');
    expect(ids('calendar-note')).toEqual(['free-shape:calendar-note']);
    const note = sample.views[0]?.freeShapes.find((shape) => shape.id === 'calendar-note');
    const words = note && note.kind === 'note' ? note.text.split(/\s+/).slice(0, 2).join(' ') : '';
    expect(ids(words)).toContain('free-shape:calendar-note');
    expect(find(index, 'calendar-note').found[0]?.entry.view).toBe('system-overview');
  });

  it('needs every word, in any of the fields', () => {
    expect(ids('booking scheduling')).toEqual([]);
    expect(ids('appointments postgres')).toEqual(['element:appointments-db']);
  });

  it('lists at most as many as asked, and says how many it found', () => {
    const many = find(index, 'a', 3);
    expect(many.found).toHaveLength(3);
    expect(many.total).toBeGreaterThan(3);
  });

  it('keeps each entry while its element is unchanged, so that indexing again costs little', () => {
    const again = indexProject(sample, definitionsIn(sample));
    expect(again.entries[0]).toBe(index.entries[0]);
  });

  it('stays within the frame budget at 10,000 elements', () => {
    const big = syntheticProject({ elements: 10_000 });
    const definitions = definitionsIn(big);
    // Indexing the first time goes a slice at a time, each well within a frame.
    const builder = new IndexBuilder(big, definitions);
    // Measured in the CPU time the work takes, which a loaded machine does not stretch as it
    // stretches the clock. That time moves in ticks (about 15.6 ms on Windows), so each measure is
    // an average over enough work to span many of them.
    let steps = 0;
    const indexing = cpuNow();
    for (let done = false; !done; steps += 1) done = builder.step(4);
    const perStep = (cpuNow() - indexing) / steps;
    const built = builder.index as FindIndex;
    expect(built.entries.length).toBeGreaterThan(10_000);
    expect(steps).toBeGreaterThan(1);
    expect(perStep).toBeLessThan(16);
    // A search, warmed up as typing is after the first key, fits in a frame (16.7 ms) on average.
    // Measured on a quiet machine, one took 0.1 to 6 ms, and 7 to 11 for a single letter, which
    // matches nearly everything.
    const queries = ['service', 's', 'servicio', 'system 42', 'xyz', 'service 9999'];
    for (const query of queries) find(built, query);
    const rounds = 10;
    const searching = cpuNow();
    for (let round = 0; round < rounds; round += 1) for (const query of queries) find(built, query);
    expect((cpuNow() - searching) / (rounds * queries.length)).toBeLessThan(16);
  });
});
