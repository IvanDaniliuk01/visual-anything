/**
 * Drawing defaults (ADR 0086): the presets, the layers a project and a view lay over them, the checks
 * of what is given, and `set-drawing-defaults` as one undoable action that writes valid files.
 */
import fc from 'fast-check';
import type { DrawingDefaults } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { executeCommand } from './commands';
import { EMPTY_HISTORY, record, undo } from './history';
import {
  DRAWING_BEFORE_A5,
  DRAWING_GROUPS,
  DRAWING_PRESETS,
  DRAWING_PRESET_IDS,
  DRAWING_VALUES,
  arrowheadOf,
  drawingOf,
  drawingProblems,
  resolveDrawing,
  type DrawingValueRule,
} from './drawing';
import { testProject } from './test/fixtures';

/** A value a rule allows, drawn by fast-check. */
function allowed(rule: DrawingValueRule): fc.Arbitrary<unknown> {
  return rule.kind === 'number'
    ? fc.double({ min: rule.least, max: rule.most, noNaN: true })
    : fc.constantFrom(...rule.choices);
}

/** Drawing defaults that set some values of some groups, every one allowed. */
const someDrawing: fc.Arbitrary<DrawingDefaults> = fc.record(
  {
    preset: fc.constantFrom(...DRAWING_PRESET_IDS),
    ...Object.fromEntries(
      DRAWING_GROUPS.map((group) => [
        group,
        fc.record(
          Object.fromEntries(
            Object.entries(DRAWING_VALUES[group]).map(([name, rule]) => [name, allowed(rule)]),
          ),
          { requiredKeys: [] },
        ),
      ]),
    ),
  },
  { requiredKeys: [] },
);

describe('presets', () => {
  it('set every value a drawing has, within its range or among its choices', () => {
    for (const drawing of [...Object.values(DRAWING_PRESETS), DRAWING_BEFORE_A5]) {
      for (const group of DRAWING_GROUPS) {
        expect(
          Object.keys(drawing[group])
            .filter((key) => key !== 'arrow')
            .sort(),
        ).toEqual(Object.keys(DRAWING_VALUES[group]).sort());
      }
      const lines = { ...drawing.lines } as Record<string, unknown>;
      delete lines.arrow;
      expect(drawingProblems({ ...drawing, lines })).toEqual([]);
    }
  });

  it('make Clean the default, and keep how the canvas drew before for its tests', () => {
    expect(resolveDrawing(undefined, undefined)).toEqual(DRAWING_PRESETS.clean);
    expect(DRAWING_BEFORE_A5.lines.width).toBe(2);
    expect(arrowheadOf(DRAWING_BEFORE_A5, 2)).toEqual({ length: 10, halfWidth: 5 });
    expect(arrowheadOf(DRAWING_PRESETS.clean, 1.25)).toEqual({ length: 7, halfWidth: 3 });
  });
});

describe('layers', () => {
  it('lay the project over its preset, and the view over the project', () => {
    const drawing = resolveDrawing(
      { preset: 'dense', lines: { width: 3 }, text: { nameSize: 20 } },
      { text: { nameSize: 16 } },
    );
    expect(drawing.preset).toBe('dense');
    expect(drawing.lines.width).toBe(3);
    expect(drawing.text.nameSize).toBe(16);
    expect(drawing.text.detailSize).toBe(DRAWING_PRESETS.dense.text.detailSize);
  });

  it('start a view that names a preset of its own from that preset alone', () => {
    const drawing = resolveDrawing(
      { preset: 'dense', lines: { width: 3 } },
      { preset: 'expressive' },
    );
    expect(drawing).toEqual(DRAWING_PRESETS.expressive);
  });

  it('set every value from the layers, whatever they set', () => {
    fc.assert(
      fc.property(someDrawing, someDrawing, (project, view) => {
        const drawing = resolveDrawing(project, view);
        const base = DRAWING_PRESETS[view.preset ?? project.preset ?? 'clean'];
        for (const group of DRAWING_GROUPS) {
          for (const name of Object.keys(DRAWING_VALUES[group])) {
            const fromView = (view[group] as Record<string, unknown> | undefined)?.[name];
            const fromProject =
              view.preset === undefined
                ? (project[group] as Record<string, unknown> | undefined)?.[name]
                : undefined;
            const expected =
              fromView ?? fromProject ?? (base[group] as Record<string, unknown>)[name];
            expect((drawing[group] as Record<string, unknown>)[name]).toEqual(expected);
          }
        }
      }),
    );
  });
});

describe('checks', () => {
  it('accept whatever the schema allows', () => {
    fc.assert(fc.property(someDrawing, (drawing) => drawingProblems(drawing).length === 0));
  });

  it('refuse groups, values and presets a drawing does not have, and values out of range', () => {
    expect(drawingProblems({ preset: 'loud' })[0]).toMatch(/no drawing preset "loud"/);
    expect(drawingProblems({ colors: {} })[0]).toMatch(/no group "colors"/);
    expect(drawingProblems({ lines: { thickness: 2 } })[0]).toMatch(/no value "thickness"/);
    expect(drawingProblems({ lines: { width: 20 } })).toEqual([
      'lines.width is a number from 0.5 to 8.',
    ]);
    expect(drawingProblems({ lines: { width: Number.NaN } })).toHaveLength(1);
    expect(drawingProblems({ text: { nameWeight: 600 } })).toEqual([
      'text.nameWeight is one of 400, 500, 700.',
    ]);
    expect(drawingProblems([])).toHaveLength(1);
  });
});

describe('set-drawing-defaults', () => {
  it('sets the project’s and a view’s, writes valid files, and goes back with null', () => {
    const start = testProject();
    const view = start.views[0];
    if (!view) throw new Error('The test project has no view.');
    const project = executeCommand(start, {
      type: 'set-drawing-defaults',
      drawing: { preset: 'dense', lines: {} },
    });
    if (!project.ok) throw new Error(JSON.stringify(project.problems));
    expect(project.label).toBe('Set the drawing defaults of the project');
    expect(project.state.project.drawing).toEqual({ preset: 'dense' });
    expect(validateFile('project', project.state.project).ok).toBe(true);

    const own = executeCommand(project.state, {
      type: 'set-drawing-defaults',
      view: view.id,
      drawing: { text: { nameSize: 18 } },
    });
    if (!own.ok) throw new Error(JSON.stringify(own.problems));
    expect(own.label).toBe(`Set the drawing defaults of "${view.name}"`);
    const changed = own.state.views[0];
    expect(validateFile('view', changed).ok).toBe(true);
    expect(drawingOf(own.state, view.id).text.nameSize).toBe(18);
    expect(drawingOf(own.state, view.id).preset).toBe('dense');
    expect(drawingOf(own.state).text.nameSize).toBe(DRAWING_PRESETS.dense.text.nameSize);

    const back = executeCommand(own.state, {
      type: 'set-drawing-defaults',
      view: view.id,
      drawing: null,
    });
    if (!back.ok) throw new Error(JSON.stringify(back.problems));
    expect(back.label).toBe(`Reset the drawing defaults of "${view.name}"`);
    expect(back.state.views[0]?.drawing).toBeUndefined();
  });

  it('writes valid files for any drawing it allows, in the project or a view, and undoes to what was', () => {
    const start = testProject();
    const view = start.views[0];
    if (!view) throw new Error('The test project has no view.');
    fc.assert(
      fc.property(someDrawing, fc.boolean(), (drawing, inView) => {
        const outcome = executeCommand(start, {
          type: 'set-drawing-defaults',
          ...(inView ? { view: view.id } : {}),
          drawing,
        });
        if (!outcome.ok) throw new Error(JSON.stringify(outcome.problems));
        expect(validateFile('project', outcome.state.project).ok).toBe(true);
        for (const each of outcome.state.views) expect(validateFile('view', each).ok).toBe(true);
        const history = record(EMPTY_HISTORY, {
          label: outcome.label,
          author: 'claude',
          operations: outcome.operations,
          inverse: outcome.inverse,
        });
        const undone = undo(outcome.state, history);
        expect(undone?.state).toEqual(start);
        expect(undone?.entry.author).toBe('claude');
      }),
      { numRuns: 100 },
    );
  });

  it('refuses what is not valid, changing nothing', () => {
    const outcome = executeCommand(testProject(), {
      type: 'set-drawing-defaults',
      drawing: { lines: { width: 99 } },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.problems[0]?.code).toBe('invalid-drawing');
  });
});
