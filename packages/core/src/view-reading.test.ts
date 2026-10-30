/**
 * How a view reads many lines (ADR 0080, section 5): `update-view` sets which rows its tables draw,
 * `rows`, and whether selecting fades the lines that do not touch the selection,
 * `selectionFadesLines`. Each is undoable; the defaults are left out of the file.
 */
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { applyOperations } from './operations';
import type { ProblemCode } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { colorProject, sequentialIds } from './test/fixtures';

function ok(command: Command, state: ProjectSnapshot = colorProject()): ProjectSnapshot {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome.state;
}

function refused(command: Command): ProblemCode[] {
  const outcome = executeCommand(colorProject(), command, { newId: sequentialIds() });
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

const view = (state: ProjectSnapshot) => state.views[0] as ProjectSnapshot['views'][number];
const update = (changes: Record<string, unknown>): Command =>
  ({ type: 'update-view', id: 'overview', changes }) as Command;

describe('how a view reads many lines (ADR 0080, section 5)', () => {
  it('draws only key rows with rows: keys, and every row again with all or null', () => {
    const keys = ok(update({ rows: 'keys' }));
    expect(view(keys).rows).toBe('keys');
    expect(view(ok(update({ rows: 'all' }), keys))).not.toHaveProperty('rows');
    expect(view(ok(update({ rows: null }), keys))).not.toHaveProperty('rows');
    expect(refused(update({ rows: 'some' }))).toEqual(['invalid-command']);
  });

  it('turns the fading of lines off with false, and on again with true or null', () => {
    const off = ok(update({ selectionFadesLines: false }));
    expect(view(off).selectionFadesLines).toBe(false);
    expect(view(ok(update({ selectionFadesLines: true }), off))).not.toHaveProperty(
      'selectionFadesLines',
    );
    expect(view(ok(update({ selectionFadesLines: null }), off))).not.toHaveProperty(
      'selectionFadesLines',
    );
    expect(refused(update({ selectionFadesLines: 'no' }))).toEqual(['invalid-command']);
  });
});
