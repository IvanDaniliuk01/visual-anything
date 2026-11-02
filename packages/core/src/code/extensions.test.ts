/**
 * What package code adds to the app (ADR 0089): its declarations, stored with its code and part of
 * the hash it is approved by; the checks of what its four hooks answer, which keep only plain data
 * within its caps and never a command code may not send; and the changes an action answers, shown
 * for review and applied as one action of the person's.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../commands';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds, testProject } from '../test/fixtures';
import {
  checkChangesAnswer,
  checkExportAnswer,
  checkPanelAnswer,
  checkedExtensions,
  previewPackageChanges,
} from './extensions';
import { codeHash } from './hash';
import { CODE_LIMITS } from './limits';
import { packageCodeOf } from './packages';

const MODULE = 'export function act(input) {\n  return { commands: [] };\n}\n';

const EXTENSIONS = {
  actions: [
    {
      id: 'find-lonely',
      label: 'Find tables no relation reaches',
      where: ['selection', 'packages-menu'],
      components: ['test.database'],
    },
  ],
  importers: [{ id: 'ddl', label: 'SQL DDL', extensions: ['.sql', '.ddl'] }],
  exporters: [{ id: 'ddl', label: 'SQL DDL', extension: '.sql' }],
  panels: [{ id: 'health', label: 'Health' }],
};

function run(command: Command, state: ProjectSnapshot = testProject()) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

function ok(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

const testPackage = (state: ProjectSnapshot) => state.packages.find((each) => each.id === 'test');

describe('declarations', () => {
  it('keeps what each kind has, in the order given', () => {
    expect(checkedExtensions(EXTENSIONS)).toEqual({ ok: true, extensions: EXTENSIONS });
    expect(checkedExtensions({})).toEqual({ ok: true, extensions: undefined });
    expect(checkedExtensions({ actions: [] })).toEqual({ ok: true, extensions: undefined });
  });

  it.each([
    ['a kind there is not', { menus: [] }, '"menus"'],
    ['an id with capitals', { panels: [{ id: 'Health', label: 'H' }] }, 'lower case'],
    [
      'two ids alike',
      {
        panels: [
          { id: 'a', label: 'A' },
          { id: 'a', label: 'B' },
        ],
      },
      'two of one kind',
    ],
    ['an empty label', { panels: [{ id: 'a', label: ' ' }] }, '1 to 60'],
    ['an action offered nowhere', { actions: [{ id: 'a', label: 'A', where: [] }] }, 'offered'],
    [
      'an action offered somewhere else',
      { actions: [{ id: 'a', label: 'A', where: ['toolbar'] }] },
      'offered',
    ],
    [
      'an importer of an extension without its dot',
      { importers: [{ id: 'a', label: 'A', extensions: ['sql'] }] },
      '".sql"',
    ],
    [
      'a key a kind has not',
      { exporters: [{ id: 'a', label: 'A', extension: '.x', run: 1 }] },
      '"run"',
    ],
    [
      'nine panels',
      { panels: Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, label: 'P' })) },
      'more of one kind',
    ],
  ])('refuses %s', (_, value, words) => {
    const checked = checkedExtensions(value);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.reason).toContain(words);
  });
});

describe('stored with the code', () => {
  it('is set with set-package-code, undone, and goes with the code', () => {
    const withCode = ok({ type: 'set-package-code', package: 'test', code: MODULE });
    const outcome = ok(
      { type: 'set-package-code', package: 'test', extensions: EXTENSIONS } as Command,
      withCode.state,
    );
    expect(testPackage(outcome.state)?.extensions).toEqual(EXTENSIONS);
    expect(outcome.label).toBe('Change what the code of the package "Test" adds');
    const removed = ok({ type: 'set-package-code', package: 'test', code: null }, outcome.state);
    expect(testPackage(removed.state)?.extensions).toBeUndefined();
  });

  it('refuses declarations without code, and declarations that do not check', () => {
    const without = run({
      type: 'set-package-code',
      package: 'test',
      extensions: EXTENSIONS,
    } as Command);
    expect(without.ok).toBe(false);
    const bad = run({
      type: 'set-package-code',
      package: 'test',
      code: MODULE,
      extensions: { panels: [{ id: 'X', label: 'X' }] },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problems[0]?.code).toBe('invalid-code');
  });

  it('is part of the hash, so that adding an action asks for approval again, while code without any keeps its hash', () => {
    const code = MODULE.split('\n');
    expect(codeHash(code, [], undefined)).toBe(codeHash(code, []));
    expect(codeHash(code, [], EXTENSIONS)).not.toBe(codeHash(code, []));
    const reordered = {
      panels: EXTENSIONS.panels,
      actions: EXTENSIONS.actions.map(({ components, where, label, id }) => ({
        components,
        where,
        label,
        id,
      })),
      exporters: EXTENSIONS.exporters,
      importers: EXTENSIONS.importers,
    };
    expect(codeHash(code, [], reordered)).toBe(codeHash(code, [], EXTENSIONS));
    const withCode = ok({
      type: 'set-package-code',
      package: 'test',
      code: MODULE,
      extensions: EXTENSIONS,
    } as Command);
    const file = testPackage(withCode.state);
    if (file === undefined) throw new Error('No package');
    expect(packageCodeOf(file)).toMatchObject({
      extensions: EXTENSIONS,
      hash: codeHash(file.code ?? [], [], EXTENSIONS),
    });
  });
});

describe('what the hooks answer', () => {
  it('keeps changes as commands with a label, the action’s when the code gives none', () => {
    const commands = [{ type: 'update-element', id: 'api', changes: { name: 'Gateway' } }];
    expect(checkChangesAnswer({ commands }, 'Rename')).toEqual({
      ok: true,
      value: { label: 'Rename', commands },
    });
    expect(checkChangesAnswer({ label: 'Mine', commands: [] }, 'Rename')).toEqual({
      ok: true,
      value: { label: 'Mine', commands: [] },
    });
  });

  it.each([
    ['no object', [], 'not an object'],
    ['a key besides the label and the commands', { commands: [], run: true }, '"run"'],
    ['commands that are not a list', { commands: {} }, 'not a list'],
    ['a command without a type', { commands: [{ id: 'api' }] }, 'no type'],
    ['a comment', { commands: [{ type: 'add-comment' }] }, '"add-comment"'],
    [
      'code, even in a batch',
      { commands: [{ type: 'batch', label: 'x', commands: [{ type: 'set-package-code' }] }] },
      '"set-package-code"',
    ],
    ['a function', { commands: [() => 1] }, 'plain data'],
  ])('drops changes with %s', (_, answer, words) => {
    const checked = checkChangesAnswer(answer, 'Act');
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.reason).toContain(words);
  });

  it('drops more commands than an answer holds', () => {
    const commands = Array.from({ length: CODE_LIMITS.changesCommands + 1 }, () => ({
      type: 'undo',
    }));
    expect(checkChangesAnswer({ commands }, 'Act').ok).toBe(false);
  });

  it('keeps an export’s text within its cap', () => {
    expect(checkExportAnswer('CREATE TABLE a ();')).toEqual({
      ok: true,
      value: 'CREATE TABLE a ();',
    });
    expect(checkExportAnswer(42).ok).toBe(false);
    expect(checkExportAnswer('x'.repeat(CODE_LIMITS.exportText + 1)).ok).toBe(false);
  });

  it('keeps a panel built afresh from the parts each block has', () => {
    const answer = [
      { kind: 'heading', text: 'Health' },
      { kind: 'value', label: 'Rows', value: 1200, extra: 'dropped' },
      {
        kind: 'table',
        columns: ['Name', 'Rows'],
        rows: [
          ['a', 1],
          ['b', null],
        ],
      },
      {
        kind: 'chart',
        chart: 'bar',
        labels: ['Mon', 'Tue'],
        series: [{ name: 'Load', values: [1, 2] }],
      },
      { kind: 'button', label: 'Find', action: 'find-lonely' },
    ];
    const checked = checkPanelAnswer(answer, ['find-lonely']);
    expect(checked).toEqual({
      ok: true,
      value: [
        { kind: 'heading', text: 'Health' },
        { kind: 'value', label: 'Rows', value: 1200 },
        {
          kind: 'table',
          columns: ['Name', 'Rows'],
          rows: [
            ['a', 1],
            ['b', null],
          ],
        },
        {
          kind: 'chart',
          chart: 'bar',
          labels: ['Mon', 'Tue'],
          series: [{ name: 'Load', values: [1, 2] }],
        },
        { kind: 'button', label: 'Find', action: 'find-lonely' },
      ],
    });
  });

  it.each([
    ['a block of no kind', [{ kind: 'html', html: '<b>x</b>' }], 'block 1'],
    [
      'a button that runs nothing declared',
      [{ kind: 'button', label: 'Go', action: 'other' }],
      'no action',
    ],
    [
      'a row of the wrong length',
      [{ kind: 'table', columns: ['a', 'b'], rows: [['x']] }],
      'cell for each column',
    ],
    [
      'a chart value that is not finite',
      [
        {
          kind: 'chart',
          chart: 'line',
          labels: ['a'],
          series: [{ name: 's', values: [Number.NaN] }],
        },
      ],
      'plain data',
    ],
  ])('drops a panel with %s', (_, answer, words) => {
    const checked = checkPanelAnswer(answer, ['find-lonely']);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.reason).toContain(words);
  });

  it('never throws, and keeps only plain data, whatever it is given', () => {
    fc.assert(
      fc.property(fc.anything(), (answer) => {
        const changes = checkChangesAnswer(answer, 'Act');
        const panel = checkPanelAnswer(answer, ['a']);
        const exported = checkExportAnswer(answer);
        for (const checked of [changes, panel, exported]) {
          if (checked.ok) expect(JSON.parse(JSON.stringify(checked.value))).toEqual(checked.value);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('changes for review', () => {
  it('shows what would change, never applies it, and gives the one command the person accepts', () => {
    const project = testProject();
    const preview = previewPackageChanges(project, {
      label: 'Rename the API',
      commands: [{ type: 'update-element', id: 'api', changes: { name: 'Gateway' } }],
    });
    if (!preview.ok) throw new Error('Refused');
    expect(preview.command).toEqual({
      type: 'batch',
      label: 'Rename the API',
      commands: [{ type: 'update-element', id: 'api', changes: { name: 'Gateway' } }],
    });
    expect(preview.comparison.changes.length).toBeGreaterThan(0);
    expect(project.model.elements.find((each) => each.id === 'api')?.name).toBe('API');
    // The project with the changes, which the canvas draws as the newer version during the review.
    expect(preview.project.model.elements.find((each) => each.id === 'api')?.name).toBe('Gateway');
    const accepted = executeCommand(project, preview.command, {
      newId: sequentialIds(),
      author: 'user',
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.state.model.elements.find((each) => each.id === 'api')?.name).toBe('Gateway');
    }
  });

  it('refuses changes that break a rule, whole', () => {
    const preview = previewPackageChanges(testProject(), {
      label: 'Break',
      commands: [
        { type: 'update-element', id: 'api', changes: { name: 'Gateway' } },
        { type: 'update-element', id: 'nowhere', changes: { name: 'X' } },
      ],
    });
    expect(preview.ok).toBe(false);
  });
});
