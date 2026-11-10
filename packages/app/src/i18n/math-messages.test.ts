/**
 * What checking a project's Math says (ADR 0106) through the Spanish templates (ADR-0038): the sample
 * project with Math that cannot be typeset in every kind of text that takes text emphasis, past the
 * listed counts and past the most a check typesets. Every warning and notice must read in Spanish,
 * KaTeX's own message after the colon left as KaTeX writes it.
 */
import { checkProject, type ProjectSnapshot } from '@visual-anything/core';
import type { PackageFile, TourFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { translateMessage, untranslatedParts } from './translate';

/** The sample with failing Math in each kind of text, and more texts with Math than are listed. */
function withMath(): ProjectSnapshot {
  const state = structuredClone(loadSample());
  const bad = (at: number) => `$\\nope${at}$`;
  state.project.description = bad(0);
  const own: PackageFile = {
    id: 'mathy',
    name: 'Mathy',
    description: bad(1),
    components: [
      {
        id: 'mathy.model',
        name: 'Model',
        derivesFrom: 'essence',
        description: bad(2),
        attributes: [{ name: 'loss', type: 'string', format: 'emphasis', description: bad(3) }],
      },
    ],
    relationTypes: [
      { id: 'mathy.feeds', name: 'feeds', derivesFrom: 'relates-to', description: bad(4) },
    ],
  };
  state.packages = [...state.packages, own];
  state.project = { ...state.project, packages: [...state.project.packages, 'mathy'] };
  const [first, second] = state.model.elements;
  state.model.elements.push({
    id: 'regression',
    component: 'mathy.model',
    name: 'Regression',
    description: bad(5),
    attributes: { loss: bad(6) },
  });
  state.model.relations.push({
    id: 'feeds',
    relationType: 'mathy.feeds',
    from: first!.id,
    to: second!.id,
    description: bad(7),
  });
  const view = state.views[0]!;
  view.description = bad(8);
  view.perspective = { ...view.perspective, description: bad(9) };
  view.freeShapes = [
    ...view.freeShapes,
    { kind: 'note', id: 'math-note', x: 0, y: 0, width: 100, height: 50, text: bad(10) },
  ];
  state.scenarios[0]!.description = bad(11);
  const tour: TourFile = {
    id: 'math-tour',
    name: 'Math',
    description: bad(12),
    steps: [
      {
        id: 'one',
        viewState: { view: view.id },
        caption: { title: 'One', text: bad(13) },
        reveal: [{ marks: [first!.id], text: bad(14) }],
        notes: bad(15),
      },
    ],
  };
  state.tours = [...state.tours, tour];
  // More pieces that cannot be typeset than are listed, more texts with Math than are listed, and
  // more distinct pieces than one check typesets, in tours, which are read last.
  tour.steps[0]!.notes = Array.from({ length: 10 }, (_, at) => bad(15 + at)).join(' ');
  for (let at = 0; at < 6; at++) {
    state.tours.push({
      id: `many-${at}`,
      name: `Many ${at}`,
      steps: [
        {
          id: 'one',
          viewState: { view: view.id },
          caption: { title: 'One' },
          notes: Array.from({ length: 200 }, (_, n) => `$x_{${at * 200 + n}}$`).join(' '),
        },
      ],
    });
  }
  return state;
}

const checked = checkProject(withMath());
const warned = checked.warnings
  .filter((each) => each.code === 'math-error')
  .map((each) => each.message);
const said = [...warned, ...(checked.notices ?? []).map((each) => each.message)];

describe('the messages about Math', () => {
  it('cover every kind of text, the summaries and what a check leaves', () => {
    expect(checked.errors).toEqual([]);
    for (const where of [
      'the description of the project',
      'the description of the package "Mathy"',
      'the description of the component "Model"',
      'the description of the attribute "loss" of the component "Model"',
      'the description of the relation type "feeds"',
      'the description of the element "Regression"',
      'the value of "loss" of the element "Regression"',
      'the description of the relation "feeds"',
      'the description of the view',
      'the description of the perspective of the view',
      'a note in the view',
      'the description of the scenario',
      'the description of the tour "Math"',
      'the caption of step 1 of the tour "Math"',
      'reveal 1 of step 1 of the tour "Math"',
      'the speaker notes of step 1 of the tour "Math"',
    ]) {
      expect(
        warned.some((message) => message.startsWith(`Math in ${where}`)),
        where,
      ).toBe(true);
    }
    expect(warned.at(-1)).toBe('…and 5 more pieces of Math cannot be typeset.');
    expect(said.at(-2)).toBe('…and 2 more texts read as Math.');
    expect(said.at(-1)).toBe(
      'Math in 2 texts was not checked: one check typesets at most 1,000 pieces of Math.',
    );
  });

  it('read in Spanish in the forms for one too', () => {
    for (const message of [
      '…and 1 more piece of Math cannot be typeset.',
      '…and 1 more text reads as Math.',
      'Math in 1 text was not checked: one check typesets at most 1,000 pieces of Math.',
    ]) {
      expect(untranslatedParts('es', message), message).toEqual([]);
    }
  });

  it('read in Spanish as the core writes them', () => {
    const untranslated = said.filter((message) => untranslatedParts('es', message).length > 0);
    expect(untranslated).toEqual([]);
  });

  it('read as Spanish people would write them', () => {
    expect(
      translateMessage(
        'es',
        'Math in the value of "loss" of the element "Regression" is drawn as its TeX, "\\nope6", since it cannot be typeset: KaTeX parse error: Undefined control sequence: \\nope6 at position 1: \\nope6',
      ),
    ).toBe(
      'La notación matemática del valor de "loss" del elemento "Regression" se dibuja como su TeX, "\\nope6", porque no se puede componer: KaTeX parse error: Undefined control sequence: \\nope6 at position 1: \\nope6',
    );
    expect(
      translateMessage(
        'es',
        'Math is read in reveal 1 of step 1 of the tour "Math": write \\$ for a dollar sign that is not Math.',
      ),
    ).toBe(
      'Se lee notación matemática en la revelación 1 del paso 1 del recorrido "Math": escribir \\$ para un signo de dólar que no sea notación matemática.',
    );
  });
});
