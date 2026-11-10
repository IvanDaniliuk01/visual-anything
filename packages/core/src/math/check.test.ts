import type { PackageFile, TourFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import { TEST_PACKAGE, testProject } from '../test/fixtures';
import { MAX_MATH_CHECKED, emphasisTexts, mathErrorText, mathFindings, mathIn } from './check';

/** The test project with a component whose `summary` takes text emphasis, and a tour. */
function project(change: (state: ProjectSnapshot) => void = () => {}): ProjectSnapshot {
  const state = testProject();
  const withSummary: PackageFile = {
    ...TEST_PACKAGE,
    components: TEST_PACKAGE.components.map((component) =>
      component.id === 'test.box'
        ? {
            ...component,
            attributes: [
              ...(component.attributes ?? []),
              { name: 'summary', type: 'string', format: 'emphasis' },
              { name: 'formula', type: 'string' },
            ],
          }
        : component,
    ),
  };
  state.packages = [withSummary];
  const tour: TourFile = {
    id: 'walk',
    name: 'Walk',
    steps: [
      {
        id: 'one',
        viewState: { view: 'overview' },
        caption: { title: 'One' },
      },
    ],
  };
  state.tours = [tour];
  change(state);
  return state;
}

function messagesOf(state: ProjectSnapshot) {
  const { warnings, notices } = mathFindings(state, definitionsIn(state));
  return {
    warnings: warnings.map((each) => [each.code, each.message, each.subjects]),
    notices: notices.map((each) => [each.code, each.message, each.subjects]),
  };
}

describe('mathIn', () => {
  it('finds Math within lines, in blocks, lists, quotes and tables, and math fences', () => {
    const text = [
      'a $x^2$ and $$\\sum_i i$$',
      '',
      '- an item with $y$',
      '',
      '> a quote with $z$',
      '',
      '| $a$ | b |',
      '|---|---|',
      '| c | $d$ |',
      '',
      '$$',
      '\\frac{1}{n}',
      '$$',
      '',
      '```math',
      'e = mc^2',
      '```',
    ].join('\n');
    expect(mathIn(text, true)).toEqual([
      { tex: 'x^2', display: false },
      { tex: '\\sum_i i', display: true },
      { tex: 'y', display: false },
      { tex: 'z', display: false },
      { tex: 'a', display: false },
      { tex: 'd', display: false },
      { tex: '\\frac{1}{n}', display: true },
      { tex: 'e = mc^2', display: true },
    ]);
  });

  it('reads a text of one line without blocks, and leaves dollars that are not Math', () => {
    expect(mathIn('```math\nx\n```', false)).toEqual([]);
    expect(mathIn('$20,000 and $30,000', true)).toEqual([]);
    expect(mathIn('a \\$x$ b', true)).toEqual([]);
    expect(mathIn('plain words', true)).toEqual([]);
    expect(mathIn('**$x$** and $$y$$', false)).toEqual([
      { tex: 'x', display: false },
      { tex: 'y', display: true },
    ]);
  });
});

describe('emphasisTexts', () => {
  it('lists every text that takes text emphasis, how it is read and where it is', () => {
    const state = project((state) => {
      state.project.description = 'p';
      const [file] = state.packages;
      const box = file!.components[0]!;
      file!.description = 'pk';
      box.description = 'c';
      box.attributes![0]!.description = 'a';
      file!.relationTypes[0]!.description = 'rt';
      state.model.world.description = 'w';
      const api = state.model.elements.find((each) => each.id === 'api')!;
      api.description = 'e';
      const system = state.model.elements.find((each) => each.id === 'system')!;
      system.attributes = { summary: 's', formula: '$x$', owner: '$y$' };
      state.model.relations[0]!.description = 'r';
      const view = state.views[0]!;
      view.description = 'v';
      view.perspective = { name: 'Flow', description: 'pe' };
      state.scenarios[0]!.description = 'sc';
      const tour = state.tours[0]!;
      tour.description = 't';
      tour.steps[0]!.caption.text = 'ca';
      tour.steps[0]!.reveal = [{ marks: ['api'] }, { marks: ['db'], text: 're' }];
      tour.steps[0]!.notes = 'no';
    });
    expect(
      [...emphasisTexts(state, definitionsIn(state))].map((each) => [
        each.text,
        each.blocks,
        each.where,
        each.subject,
      ]),
    ).toEqual([
      ['p', true, 'the description of the project', undefined],
      ['pk', true, 'the description of the package "Test"', 'test'],
      ['c', true, 'the description of the component "Box"', 'test.box'],
      ['a', true, 'the description of the attribute "owner" of the component "Box"', 'test.box'],
      [
        'The team that runs it.',
        true,
        'the description of the attribute "owner" of the component "Service"',
        'test.service',
      ],
      ['rt', true, 'the description of the relation type "calls"', 'test.calls'],
      ['w', true, 'the description of the element "World"', 'world'],
      ['s', false, 'the value of "summary" of the element "System"', 'system'],
      ['e', true, 'the description of the element "API"', 'api'],
      ['r', true, 'the description of the relation "api-in-system"', 'api-in-system'],
      ['v', true, 'the description of the view "Overview"', 'overview'],
      ['pe', false, 'the description of the perspective of the view "Overview"', 'overview'],
      ['Hi', true, 'a note in the view "Overview"', 'overview'],
      ['sc', true, 'the description of the scenario "A request"', 'request'],
      ['t', true, 'the description of the tour "Walk"', 'walk'],
      ['ca', true, 'the caption of step 1 of the tour "Walk"', 'walk'],
      ['re', true, 'reveal 2 of step 1 of the tour "Walk"', 'walk'],
      ['no', true, 'the speaker notes of step 1 of the tour "Walk"', 'walk'],
    ]);
  });
});

describe('mathFindings', () => {
  it('finds nothing in a project without Math', () => {
    expect(messagesOf(project())).toEqual({ warnings: [], notices: [] });
  });

  it('tells once of each text that holds Math, and warns of each piece that cannot be typeset', () => {
    const state = project((state) => {
      const api = state.model.elements.find((each) => each.id === 'api')!;
      api.description = 'Loss $\\frac{1}{n}$, then $\\foo$ and $\\color{red}{x}$.';
      const system = state.model.elements.find((each) => each.id === 'system')!;
      system.attributes = { summary: 'is $x^2$', formula: '$\\foo$' };
    });
    expect(messagesOf(state)).toEqual({
      warnings: [
        [
          'math-error',
          'Math in the description of the element "API" is drawn as its TeX, "\\foo", since it cannot be typeset: KaTeX parse error: Undefined control sequence: \\foo at position 1: \\foo',
          ['api'],
        ],
        [
          'math-error',
          'Math in the description of the element "API" is drawn as its TeX, "\\color{red}{x}", since it cannot be typeset: Math does not take \\color: colors come from the theme.',
          ['api'],
        ],
      ],
      notices: [
        [
          'reads-as-math',
          'Math is read in the value of "summary" of the element "System": write \\$ for a dollar sign that is not Math.',
          ['system'],
        ],
        [
          'reads-as-math',
          'Math is read in the description of the element "API": write \\$ for a dollar sign that is not Math.',
          ['api'],
        ],
      ],
    });
  });

  it('names the project, notes and tour texts, and quotes long TeX cut on one line', () => {
    const long = `\\foo ${'x + '.repeat(20)}\n y`;
    const state = project((state) => {
      state.project.description = `$$\n${long}\n$$`;
      state.views[0]!.freeShapes = [
        { kind: 'note', id: 'note', x: 0, y: 0, width: 1, height: 1, text: '$\\bar$' },
      ];
      state.tours[0]!.steps[0]!.notes = '$\\left($';
    });
    const { warnings } = messagesOf(state);
    expect(
      warnings.map(([, message, subjects]) => [String(message).split(':')[0], subjects]),
    ).toEqual([
      [
        'Math in the description of the project is drawn as its TeX, "\\foo x + x + x + x + x + x + x + x + x…", since it cannot be typeset',
        undefined,
      ],
      [
        'Math in a note in the view "Overview" is drawn as its TeX, "\\bar", since it cannot be typeset',
        ['overview'],
      ],
      [
        'Math in the speaker notes of step 1 of the tour "Walk" is drawn as its TeX, "\\left(", since it cannot be typeset',
        ['walk'],
      ],
    ]);
  });

  it('lists twenty of each kind, then a summary', () => {
    const state = project((state) => {
      for (let at = 0; at < 23; at++) {
        state.model.elements.push({
          id: `e${at}`,
          component: 'test.box',
          name: `E${at}`,
          description: `$\\nope${at}$ and $\\nope${at}$`,
        });
      }
    });
    const { warnings, notices } = mathFindings(state, definitionsIn(state));
    expect(warnings).toHaveLength(21);
    expect(warnings.at(-1)?.message).toBe('…and 26 more pieces of Math cannot be typeset.');
    expect(notices).toHaveLength(21);
    expect(notices.at(-1)?.message).toBe('…and 3 more texts read as Math.');
  });

  it(`typesets at most ${MAX_MATH_CHECKED} distinct pieces in one check, and says what it left`, () => {
    const state = project((state) => {
      state.model.elements.push({
        id: 'many',
        component: 'test.box',
        name: 'Many',
        description: Array.from({ length: 200 }, (_, at) => `$x_{${at}}$`).join(' '),
      });
      for (let at = 0; at < 6; at++) {
        state.model.elements.push({
          id: `more${at}`,
          component: 'test.box',
          name: `More ${at}`,
          description: Array.from({ length: 200 }, (_, n) => `$y_{${at * 200 + n}}$`).join(' '),
        });
      }
    });
    const { warnings, notices } = mathFindings(state, definitionsIn(state));
    expect(warnings).toEqual([]);
    expect(notices.at(-1)?.message).toBe(
      'Math in 2 texts was not checked: one check typesets at most 1,000 pieces of Math.',
    );
  });
});

describe('checkProject', () => {
  it('warns of Math that cannot be typeset, and tells of texts read as Math apart', () => {
    const plain = checkProject(project());
    expect(plain.notices).toBeUndefined();
    const state = project((state) => {
      state.model.elements.find((each) => each.id === 'db')!.description = '$\\oops$ and $x$';
    });
    const checked = checkProject(state);
    expect(checked.errors).toEqual([]);
    expect(checked.warnings.map((each) => each.code)).toEqual(['math-error']);
    expect(checked.notices?.map((each) => each.code)).toEqual(['reads-as-math']);
  });
});

describe('mathErrorText', () => {
  it('takes away the context’s underlines and keeps the message on one line', () => {
    expect(mathErrorText('KaTeX parse error: Expected x at position 2: a}̲\n  b')).toBe(
      'KaTeX parse error: Expected x at position 2: a} b',
    );
  });
});
