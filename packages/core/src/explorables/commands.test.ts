import type { ScriptLibraryDefinition, TourStep } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command, type CommandOutcome } from '../commands';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds, testProject } from '../test/fixtures';
import { playableStep, tourStepProblems } from '../tours/steps';
import {
  explorableFileProblems,
  explorableFileWrites,
  explorableShownBy,
  explorableTextHash,
  explorableTextOf,
  explorablesIn,
} from './index';
import { definitionsIn } from '../state';

/** The commands only the local program runs, for what it read or fetched. */
const PROGRAM_ONLY: readonly string[] = ['record-explorable-file', 'define-script-library'];

function run(state: ProjectSnapshot, command: Command): Extract<CommandOutcome, { ok: true }> {
  const outcome = executeCommand(state, command, {
    newId: sequentialIds(),
    author: 'claude',
    ...(PROGRAM_ONLY.includes(command.type) ? { program: true as const } : {}),
  });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

function refusal(state: ProjectSnapshot, command: Command): string[] {
  const outcome = executeCommand(state, command, {
    newId: sequentialIds(),
    author: 'user',
    ...(PROGRAM_ONLY.includes(command.type) ? { program: true as const } : {}),
  });
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

function undoes(before: ProjectSnapshot, outcome: Extract<CommandOutcome, { ok: true }>): void {
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(before);
}

const PAGE = '<!doctype html><p>y = a·x²</p><script>va.ready()</script>';

function library(id = 'test.d3', hash = 'a'.repeat(64), bytes = 1000): ScriptLibraryDefinition {
  return {
    id,
    npm: 'd3',
    version: '7.9.0',
    tarball: 'https://registry.npmjs.org/d3/-/d3-7.9.0.tgz',
    integrity: `sha512-${'A'.repeat(86)}==`,
    path: 'dist/d3.min.js',
    license: 'ISC',
    global: 'd3',
    hash,
    bytes,
  };
}

/** The test project with a script library and an explorable, "test.quadratic", that uses it. */
function withExplorable(): ProjectSnapshot {
  const libraryDefined = run(testProject(), {
    type: 'define-script-library',
    package: 'test',
    library: library(),
  }).state;
  return run(libraryDefined, {
    type: 'define-explorable',
    package: 'test',
    explorable: {
      id: 'test.quadratic',
      name: 'Quadratic',
      scriptLibraries: ['test.d3'],
      parameters: [
        { name: 'a', kind: 'number', min: -5, max: 5, default: 1 },
        { name: 'n', kind: 'integer', min: 0, max: 10, default: 2 },
        { name: 'grid', kind: 'boolean', default: true },
        { name: 'mode', kind: 'choice', choices: ['curve', 'roots'], default: 'curve' },
      ],
    },
    text: PAGE,
  }).state;
}

describe('defining and writing explorables', () => {
  it('defines one with its text, file and hash, as one undoable action', () => {
    const before = testProject();
    const outcome = run(before, {
      type: 'define-explorable',
      package: 'test',
      explorable: { name: 'Quadratic Function' },
      text: PAGE,
    });
    const [id] = outcome.created;
    const defined = explorablesIn(outcome.state).explorable(id as string);
    expect(defined?.definition).toMatchObject({
      name: 'Quadratic Function',
      file: 'quadratic-function.html',
      api: 1,
      hash: explorableTextHash(PAGE),
    });
    expect(id?.startsWith('test.')).toBe(true);
    expect(explorableTextOf(outcome.state, id as string)?.text).toBe(PAGE);
    expect(outcome.label).toBe('Add the explorable "Quadratic Function"');
    expect(explorableFileWrites(outcome.state, outcome.operations)).toEqual([
      { explorable: id, file: 'quadratic-function.html', text: PAGE },
    ]);
    undoes(before, outcome);
  });

  it('writes a new text whose hash it records, and undo gives the previous text back', () => {
    const before = withExplorable();
    const outcome = run(before, {
      type: 'write-explorable',
      id: 'test.quadratic',
      text: '<p>2</p>',
    });
    expect(explorablesIn(outcome.state).explorable('test.quadratic')?.definition.hash).toBe(
      explorableTextHash('<p>2</p>'),
    );
    expect(outcome.label).toBe('Write the explorable "Quadratic"');
    undoes(before, outcome);
    const undone = applyOperations(outcome.state, outcome.inverse);
    expect(explorableFileWrites(undone.state, outcome.inverse, outcome.operations)).toEqual([
      { explorable: 'test.quadratic', file: 'quadratic.html', text: PAGE },
    ]);
  });

  it('records a file changed outside, which undo and redo never write back', () => {
    const before = withExplorable();
    const text = '<p>edited in the editor</p>';
    const outcome = run(before, {
      type: 'record-explorable-file',
      id: 'test.quadratic',
      text,
    });
    expect(outcome.label).toBe('The file of "Quadratic" changed');
    expect(explorableTextOf(outcome.state, 'test.quadratic')).toEqual({
      id: 'test.quadratic',
      text,
      read: true,
    });
    expect(explorableFileWrites(outcome.state, outcome.operations)).toEqual([]);
    const undone = applyOperations(outcome.state, outcome.inverse);
    expect(explorableFileWrites(undone.state, outcome.inverse, outcome.operations)).toEqual([]);
    undoes(before, outcome);
    // Claude's write over the person's text, undone, writes the person's text back.
    const written = run(outcome.state, {
      type: 'write-explorable',
      id: 'test.quadratic',
      text: 'x',
    });
    const back = applyOperations(written.state, written.inverse);
    expect(explorableFileWrites(back.state, written.inverse, written.operations)).toEqual([
      { explorable: 'test.quadratic', file: 'quadratic.html', text },
    ]);
  });

  it('records a file past its cap by its text’s hash, keeping no text', () => {
    const before = withExplorable();
    const big = 'é'.repeat(262_145);
    const outcome = run(before, {
      type: 'record-explorable-file',
      id: 'test.quadratic',
      text: big,
    });
    expect(explorableTextOf(outcome.state, 'test.quadratic')).toBeUndefined();
    expect(explorablesIn(outcome.state).explorable('test.quadratic')?.definition.hash).toBe(
      explorableTextHash(big),
    );
    // No sender names a hash: one given beside the text is refused, and none goes without a text.
    expect(
      refusal(before, {
        type: 'record-explorable-file',
        id: 'test.quadratic',
        text: 'x',
        hash: explorableTextHash(PAGE),
      } as Command),
    ).toEqual(['invalid-command']);
    expect(
      refusal(before, {
        type: 'record-explorable-file',
        id: 'test.quadratic',
        hash: 'b'.repeat(64),
      } as unknown as Command),
    ).toContain('invalid-command');
  });

  it('takes the program’s own commands only from the program, never from an app, Claude or a batch', () => {
    const before = withExplorable();
    const own: Command[] = [
      { type: 'record-explorable-file', id: 'test.quadratic', text: '<p>forged</p>' },
      { type: 'define-script-library', package: 'test', library: library('test.plot') },
    ];
    for (const command of own) {
      for (const context of [{ author: 'user' as const }, { author: 'claude' as const }, {}]) {
        const outcome = executeCommand(before, command, { newId: sequentialIds(), ...context });
        expect(outcome.ok ? [] : outcome.problems.map((each) => each.code)).toEqual([
          'program-only',
        ]);
        const batched = executeCommand(before, { type: 'batch', commands: [command] } as Command, {
          newId: sequentialIds(),
          ...context,
        });
        expect(batched.ok).toBe(false);
      }
      expect(
        executeCommand(before, command, { newId: sequentialIds(), author: 'user', program: true })
          .ok,
      ).toBe(true);
    }
  });

  it('refuses a text past 512 KiB, a taken file, a bad parameter and the 65th explorable', () => {
    const state = withExplorable();
    expect(
      refusal(state, { type: 'write-explorable', id: 'test.quadratic', text: 'é'.repeat(262_145) }),
    ).toEqual(['explorable-too-large']);
    expect(
      refusal(state, {
        type: 'define-explorable',
        package: 'test',
        explorable: { name: 'Other', file: 'quadratic.html' },
        text: '',
      }),
    ).toEqual(['id-taken']);
    for (const parameters of [
      [{ name: 'a', kind: 'number', min: 1, max: 0, default: 0 }],
      [{ name: 'a', kind: 'number', min: 0, max: 1, default: 2 }],
      [{ name: 'a', kind: 'integer', min: 0, max: 1.5, default: 0 }],
      [{ name: '1a', kind: 'boolean', default: true }],
      [
        { name: 'a', kind: 'boolean', default: true },
        { name: 'a', kind: 'boolean', default: false },
      ],
      [{ name: 'a', kind: 'choice', choices: ['x', 'x'], default: 'x' }],
      [{ name: 'a', kind: 'choice', choices: ['x'], default: 'y' }],
      [{ name: 'a', kind: 'slider', default: 1 }],
      [{ name: 'a', kind: 'boolean', default: true, min: 0 }],
    ]) {
      expect(
        refusal(state, {
          type: 'update-explorable',
          id: 'test.quadratic',
          changes: { parameters: parameters as never },
        }),
      ).toEqual(['invalid-explorable']);
    }
    let full = testProject();
    for (let n = 0; n < 64; n += 1) {
      full = run(full, {
        type: 'define-explorable',
        package: 'test',
        explorable: { name: `E${n}` },
        text: '',
      }).state;
    }
    expect(
      refusal(full, {
        type: 'define-explorable',
        package: 'test',
        explorable: { name: 'One more' },
        text: '',
      }),
    ).toEqual(['explorable-too-large']);
  });

  it('refuses a script library of another package or none, and outside its package', () => {
    const state = withExplorable();
    expect(
      refusal(state, {
        type: 'update-explorable',
        id: 'test.quadratic',
        changes: { scriptLibraries: ['test.plotly'] },
      }),
    ).toEqual(['unknown-script-library']);
    expect(
      refusal(state, {
        type: 'define-explorable',
        package: 'test',
        explorable: { id: 'other.x', name: 'X' },
        text: '',
      }),
    ).toEqual(['id-outside-package']);
    expect(
      refusal(state, {
        type: 'define-explorable',
        package: 'systems',
        explorable: { name: 'X' },
        text: '',
      }),
    ).toEqual(['built-in-package']);
  });

  it('renames, describes and sets parameters, each undoable', () => {
    const before = withExplorable();
    const renamed = run(before, {
      type: 'update-explorable',
      id: 'test.quadratic',
      changes: { name: 'Parabola' },
    });
    expect(renamed.label).toBe('Rename the explorable "Quadratic" to "Parabola"');
    undoes(before, renamed);
    const cleared = run(before, {
      type: 'update-explorable',
      id: 'test.quadratic',
      changes: { description: 'A curve.', parameters: null, scriptLibraries: null },
    });
    const definition = explorablesIn(cleared.state).explorable('test.quadratic')?.definition;
    expect(definition?.parameters).toBeUndefined();
    expect(definition?.scriptLibraries).toBeUndefined();
    expect(definition?.description).toBe('A curve.');
    undoes(before, cleared);
  });
});

describe('removing explorables and script libraries', () => {
  it('refuses to remove a script library an explorable uses, and removes it once none does', () => {
    const state = withExplorable();
    expect(refusal(state, { type: 'remove-script-library', id: 'test.d3' })).toEqual(['in-use']);
    const freed = run(state, {
      type: 'update-explorable',
      id: 'test.quadratic',
      changes: { scriptLibraries: null },
    }).state;
    const outcome = run(freed, { type: 'remove-script-library', id: 'test.d3' });
    expect(explorablesIn(outcome.state).scriptLibrary('test.d3')).toBeUndefined();
    undoes(freed, outcome);
  });

  it('refuses to remove an explorable an appearance or a shape shows; a tour step is left broken', () => {
    const state = withExplorable();
    const shown = run(state, {
      type: 'update-element',
      id: 'api',
      changes: { appearance: { explorable: { explorable: 'test.quadratic' } } },
    }).state;
    expect(explorableShownBy(shown.model.elements[1] as never, definitionsIn(shown))).toBe(
      'test.quadratic',
    );
    expect(refusal(shown, { type: 'remove-explorable', id: 'test.quadratic' })).toEqual(['in-use']);
    const shape = run(state, {
      type: 'create-free-shape',
      view: 'overview',
      shape: {
        kind: 'explorable',
        x: 0,
        y: 0,
        width: 300,
        height: 200,
        explorable: 'test.quadratic',
        element: 'api',
      },
    }).state;
    expect(refusal(shape, { type: 'remove-explorable', id: 'test.quadratic' })).toEqual(['in-use']);

    const toured = run(state, {
      type: 'create-tour',
      tour: {
        name: 'Tour',
        steps: [
          {
            viewState: { view: 'overview' },
            caption: { title: 'A curve' },
            explorable: { id: 'test.quadratic', parameters: { a: 2, mode: 'roots' } },
          },
        ],
      },
    }).state;
    const removed = run(toured, { type: 'remove-explorable', id: 'test.quadratic' });
    const step = removed.state.tours[0]?.steps[0] as TourStep;
    expect(step.explorable).toEqual({ id: 'test.quadratic', parameters: { a: 2, mode: 'roots' } });
    expect(tourStepProblems(removed.state, step).map((each) => each.code)).toEqual([
      'unknown-explorable',
    ]);
    expect(playableStep(removed.state, step)?.explorable).toBeUndefined();
    expect(explorableTextOf(removed.state, 'test.quadratic')).toBeUndefined();
    undoes(toured, removed);
    // No new explorable takes the id the broken step names.
    expect(
      refusal(removed.state, {
        type: 'define-explorable',
        package: 'test',
        explorable: { id: 'test.quadratic', name: 'Again' },
        text: '',
      }),
    ).toEqual(['id-taken']);
  });

  it('refuses a package that goes with an explorable still shown', () => {
    const state = run(withExplorable(), {
      type: 'update-element',
      id: 'api',
      changes: { appearance: { explorable: { explorable: 'test.quadratic' } } },
    }).state;
    expect(refusal(state, { type: 'update-project', changes: { packages: [] } })).toEqual([
      'in-use',
    ]);
  });
});

describe('what shows an explorable', () => {
  it('refuses an appearance or a shape naming no explorable, or a shape reading no element', () => {
    const state = withExplorable();
    expect(
      refusal(state, {
        type: 'update-element',
        id: 'api',
        changes: { appearance: { explorable: { explorable: 'test.nothing' } } },
      }),
    ).toEqual(['unknown-explorable']);
    const shape = {
      kind: 'explorable' as const,
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      explorable: 'test.quadratic',
    };
    expect(
      refusal(state, {
        type: 'create-free-shape',
        view: 'overview',
        shape: { ...shape, explorable: 'test.nothing' },
      }),
    ).toEqual(['unknown-explorable']);
    expect(
      refusal(state, {
        type: 'create-free-shape',
        view: 'overview',
        shape: { ...shape, element: 'nobody' },
      }),
    ).toEqual(['unknown-element']);
    expect(
      refusal(state, {
        type: 'create-free-shape',
        view: 'overview',
        shape: { ...shape, fill: '#FF0000' },
      } as Command),
    ).toEqual(['invalid-appearance']);
    const created = run(state, { type: 'create-free-shape', view: 'overview', shape });
    const id = created.created[0] as string;
    const bound = run(created.state, {
      type: 'update-free-shape',
      view: 'overview',
      id,
      changes: { element: 'db', name: 'The curve' },
    });
    expect(bound.state.views[0]?.freeShapes.find((each) => each.id === id)).toMatchObject({
      kind: 'explorable',
      element: 'db',
      name: 'The curve',
    });
    expect(bound.label).toBe('Edit an explorable in "Overview"');
    undoes(created.state, bound);
  });

  it('flags a tour step that sets a parameter no longer declared, or a value it does not take', () => {
    const state = withExplorable();
    const step = (parameters: Record<string, unknown>) => ({
      viewState: { view: 'overview' },
      caption: { title: 'A curve' },
      explorable: { id: 'test.quadratic', parameters },
    });
    expect(
      refusal(state, {
        type: 'create-tour',
        tour: { name: 'T', steps: [step({ a: 9 })] },
      } as Command),
    ).toEqual(['invalid-parameter']);
    expect(
      refusal(state, {
        type: 'create-tour',
        tour: { name: 'T', steps: [step({ b: 1 })] },
      } as Command),
    ).toEqual(['unknown-parameter']);
    const toured = run(state, {
      type: 'create-tour',
      tour: { name: 'T', steps: [step({ a: 2, n: 3 })] },
    } as Command).state;
    const played = playableStep(toured, toured.tours[0]?.steps[0] as TourStep);
    expect(played?.explorable).toEqual({
      id: 'test.quadratic',
      parameters: { a: 2, n: 3, grid: true, mode: 'curve' },
    });
    const narrowed = run(toured, {
      type: 'update-explorable',
      id: 'test.quadratic',
      changes: { parameters: [{ name: 'a', kind: 'number', min: 0, max: 1, default: 0 }] },
    }).state;
    const kept = narrowed.tours[0]?.steps[0] as TourStep;
    expect(tourStepProblems(narrowed, kept).map((each) => each.code)).toEqual([
      'invalid-parameter',
      'unknown-parameter',
    ]);
    expect(playableStep(narrowed, kept)?.explorable).toEqual({
      id: 'test.quadratic',
      parameters: { a: 0 },
    });
  });
});

describe('checks', () => {
  it('warns of a library license outside the list, unknown explorables and missing files', () => {
    let state = run(testProject(), {
      type: 'define-script-library',
      package: 'test',
      library: { ...library(), license: 'GPL-3.0' },
    }).state;
    state = run(state, {
      type: 'define-explorable',
      package: 'test',
      explorable: { id: 'test.q', name: 'Q', scriptLibraries: ['test.d3'] },
      text: '',
    }).state;
    const tampered: ProjectSnapshot = {
      ...state,
      model: {
        ...state.model,
        elements: state.model.elements.map((each) =>
          each.id === 'db'
            ? { ...each, appearance: { explorable: { explorable: 'test.gone' } } }
            : each,
        ),
      },
    };
    const codes = checkProject(tampered).warnings.map((each) => each.code);
    expect(codes).toContain('script-library-license');
    expect(codes).toContain('unknown-explorable');
    expect(
      explorableFileProblems(state, {
        explorables: new Map([['q.html', 'missing']]),
        scriptLibraries: new Map([['a'.repeat(64), 'missing']]),
      }).map((each) => each.code),
    ).toEqual(['explorable-file-missing', 'script-library-file-missing']);
  });

  it('refuses a script library past 16 MiB, or the project past 128 MiB', () => {
    expect(
      refusal(testProject(), {
        type: 'define-script-library',
        package: 'test',
        library: library('test.big', 'a'.repeat(64), 16 * 1024 * 1024 + 1),
      }),
    ).toEqual(['script-library-too-large']);
    let state = testProject();
    for (let n = 0; n < 8; n += 1) {
      state = run(state, {
        type: 'define-script-library',
        package: 'test',
        library: library(`test.l${n}`, n.toString(16).repeat(64), 16 * 1024 * 1024),
      }).state;
    }
    expect(
      refusal(state, {
        type: 'define-script-library',
        package: 'test',
        library: library('test.l9', '9'.repeat(64), 1),
      }),
    ).toEqual(['script-library-too-large']);
    // The same file, named twice, is kept once.
    expect(
      run(state, {
        type: 'define-script-library',
        package: 'test',
        library: library('test.again', '0'.repeat(64), 16 * 1024 * 1024),
      }).ok,
    ).toBe(true);
  });
});

describe('properties', () => {
  it('keeps every text hashing to its definition, and undo restores the project, after any writes', () => {
    const text = fc.string({ maxLength: 40 });
    const command = fc.oneof(
      text.map((each): Command => ({ type: 'write-explorable', id: 'test.quadratic', text: each })),
      text.map((each): Command => ({
        type: 'record-explorable-file',
        id: 'test.quadratic',
        text: each,
      })),
      fc.constantFrom<Command>(
        { type: 'update-explorable', id: 'test.quadratic', changes: { name: 'Renamed' } },
        { type: 'remove-explorable', id: 'test.quadratic' },
      ),
    );
    fc.assert(
      fc.property(fc.array(command, { maxLength: 6 }), (commands) => {
        const start = withExplorable();
        let state = start;
        const inverses = [];
        for (const each of commands) {
          const outcome = executeCommand(state, each, {
            newId: sequentialIds(),
            author: 'claude',
            program: true,
          });
          if (!outcome.ok) continue;
          inverses.push(outcome.inverse);
          state = outcome.state;
          const catalog = explorablesIn(state);
          for (const kept of state.explorableTexts ?? []) {
            expect(catalog.explorable(kept.id)?.definition.hash).toBe(
              explorableTextHash(kept.text),
            );
          }
        }
        for (const inverse of inverses.reverse()) state = applyOperations(state, inverse).state;
        expect(state).toStrictEqual(start);
      }),
      { numRuns: 200 },
    );
  });
});
