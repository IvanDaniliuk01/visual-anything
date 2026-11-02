/**
 * What the calls of the hooks that add to the app say when they go wrong (ADR 0089): the package,
 * the hook and what it was asked for are named, and the time a call may run is the hook's own.
 */
import { describe, expect, it } from 'vitest';
import { CODE_LIMITS } from './limits';
import { callMsOf, extensionProblem, fileTooLongProblem, undeclaredProblem } from './messages';

const pkg = { id: 'gauges', name: 'Gauges' };
const sort = { id: 'sort', name: 'Sort by heat' };

describe('the calls of the hooks that add to the app', () => {
  it('give what the person asks for longer than what the canvas calls', () => {
    expect(callMsOf('act')).toBe(CODE_LIMITS.extensionCallMs);
    expect(callMsOf('importFile')).toBe(CODE_LIMITS.extensionCallMs);
    expect(callMsOf('exportFile')).toBe(CODE_LIMITS.extensionCallMs);
    expect(callMsOf('panel')).toBe(CODE_LIMITS.callMs);
    expect(callMsOf('attributes')).toBe(CODE_LIMITS.callMs);
  });

  it('name the package, the hook and what it was asked for', () => {
    expect(extensionProblem(pkg, 'act', sort, { kind: 'threw', message: 'Error: no' })).toEqual({
      code: 'code-failed',
      message: 'The code of the package "Gauges" failed in act for "Sort by heat": Error: no',
      subjects: ['gauges'],
    });
    expect(extensionProblem(pkg, 'act', sort, { kind: 'time' }).message).toBe(
      'The code of the package "Gauges" was stopped in act for "Sort by heat": it ran past 2000 ms.',
    );
    expect(extensionProblem(pkg, 'panel', sort, { kind: 'time' }).message).toBe(
      'The code of the package "Gauges" was stopped in panel for "Sort by heat": it ran past 50 ms.',
    );
    expect(extensionProblem(pkg, 'exportFile', sort, { kind: 'memory' })).toMatchObject({
      code: 'code-stopped',
      message:
        'The code of the package "Gauges" was stopped in exportFile for "Sort by heat": it took more than 32 MiB.',
    });
    expect(
      extensionProblem(pkg, 'importFile', sort, { kind: 'answer', reason: 'it is not a text' }),
    ).toMatchObject({
      code: 'code-answer-dropped',
      message:
        'The answer of importFile from the package "Gauges" for "Sort by heat" was dropped: it is not a text.',
    });
  });

  it('refuse what the package does not declare, and a file too long to read', () => {
    expect(undeclaredProblem(pkg, 'act', 'nope').message).toBe(
      'The package "Gauges" declares no action "nope", so its code was not called.',
    );
    expect(undeclaredProblem(pkg, 'importFile', 'nope').message).toContain('no importer "nope"');
    expect(undeclaredProblem(pkg, 'exportFile', 'nope').message).toContain('no exporter "nope"');
    expect(undeclaredProblem(pkg, 'panel', 'nope').message).toContain('no panel "nope"');
    expect(fileTooLongProblem(pkg, { id: 'ddl', name: 'SQL DDL' }, 'big file.sql')).toEqual({
      code: 'code-failed',
      message: `"big file.sql" is over ${CODE_LIMITS.importText} characters, so the importer "SQL DDL" of the package "Gauges" did not read it.`,
      subjects: ['gauges'],
    });
  });
});
