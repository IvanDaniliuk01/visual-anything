import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands';
import { explorableTextOf, explorablesIn } from '../explorables/catalog';
import { MAX_EXPLORABLE_BYTES } from '../explorables/types';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds, testProject } from '../test/fixtures';
import { explorableImportName, prepareExplorableImport } from './explorable';

const PAGE = '<!doctype html><title>  The  parabola &amp; its roots </title><p>y</p>';

function imported(state: ProjectSnapshot, outcome: ReturnType<typeof prepareExplorableImport>) {
  if (!outcome.ok) throw new Error(outcome.problems.join(' '));
  const ran = executeCommand(state, outcome.command, { newId: sequentialIds(), author: 'user' });
  if (!ran.ok) throw new Error(ran.problems.map((each) => each.message).join(' '));
  return ran;
}

describe('the name an imported explorable takes', () => {
  it('is the page’s title, its spaces and entities read', () => {
    expect(explorableImportName('page.html', PAGE)).toBe('The parabola & its roots');
    expect(explorableImportName('x.html', '<TITLE>a&#39;b &#x3c;c&gt;</TITLE>')).toBe("a'b <c>");
  });

  it('is the file’s name without its ending when the page has no title, or an empty one', () => {
    expect(explorableImportName('Sorting steps.html', '<p>no title</p>')).toBe('Sorting steps');
    expect(explorableImportName('chart.HTM', '<title> </title>')).toBe('chart');
    expect(explorableImportName('.html', '')).toBe('Explorable');
  });

  it('is at most 200 characters', () => {
    expect(explorableImportName('a.html', `<title>${'x'.repeat(300)}</title>`)).toHaveLength(200);
  });
});

describe('importing HTML as an explorable', () => {
  it('defines it in the project’s own package with its text, as one action, never approved', () => {
    const state = testProject();
    const outcome = prepareExplorableImport(state, { name: 'roots.html', text: PAGE });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.command.label).toBe('Import "roots.html" as an explorable');
    expect(outcome.command.commands.map((each) => each.type)).toEqual(['define-explorable']);
    const ran = imported(state, outcome);
    const defined = explorablesIn(ran.state).explorable(outcome.explorable);
    expect(defined?.package).toBe('test');
    expect(defined?.definition.name).toBe('The parabola & its roots');
    expect(explorableTextOf(ran.state, outcome.explorable)?.text).toBe(PAGE);
    expect(ran.label).toBe('Import "roots.html" as an explorable');
  });

  it('takes the name and the package asked for', () => {
    const state = testProject();
    const outcome = prepareExplorableImport(state, {
      name: 'roots.html',
      text: PAGE,
      explorableName: 'Roots',
      package: 'test',
    });
    if (!outcome.ok) throw new Error(outcome.problems.join(' '));
    const ran = imported(state, outcome);
    expect(explorablesIn(ran.state).explorable(outcome.explorable)?.definition.name).toBe('Roots');
  });

  it('makes a package of the project’s own, in the same action, when it has none', () => {
    const state: ProjectSnapshot = {
      ...testProject(),
      project: { ...testProject().project, packages: [] },
      packages: [],
    };
    const outcome = prepareExplorableImport(state, { name: 'roots.html', text: PAGE });
    if (!outcome.ok) throw new Error(outcome.problems.join(' '));
    expect(outcome.command.commands.map((each) => each.type)).toEqual([
      'create-package',
      'define-explorable',
    ]);
    const ran = imported(state, outcome);
    expect(explorablesIn(ran.state).explorable(outcome.explorable)).toBeDefined();
  });

  it('refuses a page past 512 KiB, or a package that is not the project’s own', () => {
    const big = prepareExplorableImport(testProject(), {
      name: 'big.html',
      text: 'é'.repeat(MAX_EXPLORABLE_BYTES / 2 + 1),
    });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.problems[0]).toMatch(/512 KiB/);
    const builtin = prepareExplorableImport(testProject(), {
      name: 'a.html',
      text: PAGE,
      package: 'systems',
    });
    expect(builtin.ok).toBe(false);
  });

  it('gives a second import of the same file a file of its own', () => {
    const state = testProject();
    const first = imported(state, prepareExplorableImport(state, { name: 'a.html', text: PAGE }));
    const again = prepareExplorableImport(first.state, { name: 'a.html', text: PAGE });
    const second = imported(first.state, again);
    expect(explorablesIn(second.state).explorables.size).toBe(2);
  });
});
