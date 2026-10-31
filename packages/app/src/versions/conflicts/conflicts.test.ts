import { describe, expect, it } from 'vitest';
import { RENAMED, REMOVED, conflictedSample } from '../../test/conflicts';
import { loadSample } from '../../test/sample';
import {
  conflictChoice,
  conflictCount,
  conflictedFiles,
  keptValue,
  removalsOf,
  resolveCommand,
  valueSnippet,
} from './conflicts';

describe('the files that hold conflicts', () => {
  it('are found in the project, each with its conflicts', () => {
    const files = conflictedFiles(conflictedSample());
    expect(files.map((each) => each.key)).toEqual(['model']);
    expect(files[0]?.conflicts).toEqual([RENAMED, REMOVED]);
    expect(conflictCount(conflictedSample())).toBe(2);
    expect(conflictedFiles(loadSample())).toEqual([]);
  });

  it('read what each file keeps for a conflict, along its path', () => {
    const [model] = conflictedFiles(conflictedSample());
    if (!model) throw new Error('No file holds conflicts.');
    expect(keptValue(model, RENAMED)).toBe('WhatsApp channel');
    expect(keptValue(model, REMOVED)).toMatchObject({ id: 'reminder-service' });
  });
});

describe('a choice', () => {
  it('is the comparison between what is kept and the other choice', () => {
    const project = conflictedSample();
    const choice = conflictChoice(project, { kind: 'model' }, [RENAMED]);
    if (!choice.ok) throw new Error('The choice is refused.');
    expect(choice.comparison.changes.map((each) => `${each.ref.kind} ${each.status}`)).toEqual([
      'element changed',
    ]);
    expect(choice.other.model.elements.find((each) => each.id === 'whatsapp')?.name).toBe(
      'WhatsApp Business',
    );
    // Either way the conflict is resolved: neither project holds it.
    expect(choice.kept.model.conflicts).toEqual([REMOVED]);
  });

  it('removes what the other side removed, with what ends on it, as delete does', () => {
    const project = conflictedSample();
    const choice = conflictChoice(project, { kind: 'model' }, [REMOVED]);
    if (!choice.ok) throw new Error('The choice is refused.');
    const removed = choice.comparison.changes.filter((each) => each.status === 'removed');
    expect(removed.map((each) => each.ref.kind)).toContain('element');
    expect(removalsOf({ kind: 'model' }, [RENAMED, REMOVED], project)).toEqual({
      elements: ['reminder-service'],
    });
    expect(removalsOf({ kind: 'model' }, [RENAMED], project)).toBeUndefined();
  });

  it('is sent as the core’s resolve-conflicts', () => {
    expect(resolveCommand({ kind: 'model' }, [RENAMED, REMOVED], 'kept')).toEqual({
      type: 'resolve-conflicts',
      file: { kind: 'model' },
      resolutions: [
        { conflict: 'conflict-1', take: 'kept' },
        { conflict: 'conflict-2', take: 'kept' },
      ],
    });
  });
});

describe('a value as text', () => {
  it('is its JSON, cut when long', () => {
    expect(valueSnippet('WhatsApp')).toBe('WhatsApp');
    expect(valueSnippet({ a: 1 })).toBe('{"a":1}');
    expect(valueSnippet('x'.repeat(400)).length).toBe(301);
    expect(valueSnippet(undefined)).toBe('');
  });
});
