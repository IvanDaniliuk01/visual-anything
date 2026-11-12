import type { ScriptLibraryDefinition } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../commands';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds, testProject } from '../test/fixtures';
import { approvalHashOf } from './approvals';
import { EXPLORABLE_CARD_WHY, explorableCard } from './card';
import { explorablesIn } from './catalog';

function run(state: ProjectSnapshot, command: Command, program = false): ProjectSnapshot {
  const outcome = executeCommand(state, command, {
    newId: sequentialIds(),
    author: 'user',
    ...(program ? { program: true as const } : {}),
  });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

const D3: ScriptLibraryDefinition = {
  id: 'test.d3',
  npm: 'd3',
  version: '7.9.0',
  tarball: 'https://registry.npmjs.org/d3/-/d3-7.9.0.tgz',
  integrity: `sha512-${'A'.repeat(86)}==`,
  path: 'dist/d3.min.js',
  license: 'ISC',
  global: 'd3',
  hash: 'a'.repeat(64),
  bytes: 1000,
};

function project(): ProjectSnapshot {
  const withLibrary = run(
    testProject(),
    { type: 'define-script-library', package: 'test', library: D3 },
    true,
  );
  return run(withLibrary, {
    type: 'define-explorable',
    package: 'test',
    explorable: {
      id: 'test.parabola',
      name: 'Parabola',
      description: 'y = ax² + bx + c, as a, b and c change.',
      scriptLibraries: ['test.d3'],
    },
    text: '<p>parabola</p>',
  });
}

describe('an explorable’s card', () => {
  it('names it, says what it explains and the script libraries it asks for', () => {
    const card = explorableCard(project(), 'test.parabola');
    expect(card).toEqual({
      explorable: 'test.parabola',
      name: 'Parabola',
      description: 'y = ax² + bx + c, as a, b and c change.',
      libraries: ['d3 7.9.0'],
      reason: 'outside-app',
    });
    expect(EXPLORABLE_CARD_WHY['outside-app']).toMatch(/Visual Anything/);
  });

  it('says it is not approved when the approvals are known and none is of what runs', () => {
    const state = project();
    expect(explorableCard(state, 'test.parabola', { approvals: [] }).reason).toBe('not-approved');
    const definition = explorablesIn(state).explorable('test.parabola')?.definition;
    const hash = approvalHashOf(definition?.hash ?? '', [D3.hash]);
    expect(
      explorableCard(state, 'test.parabola', {
        approvals: [{ hash, explorable: 'test.parabola', by: 'person' }],
      }).reason,
    ).toBe('outside-app');
  });

  it('says what keeps it from running before its approval: its text or a script library', () => {
    const state = project();
    const withoutText: ProjectSnapshot = { ...state, explorableTexts: [] };
    expect(explorableCard(withoutText, 'test.parabola', { approvals: [] }).reason).toBe('no-text');
    const missing: ProjectSnapshot = {
      ...state,
      packages: state.packages.map((file) =>
        file.id === 'test'
          ? {
              ...file,
              explorables: (file.explorables ?? []).map((each) => ({
                ...each,
                scriptLibraries: ['test.plotly'],
              })),
            }
          : file,
      ),
    };
    const card = explorableCard(missing, 'test.parabola');
    expect(card.reason).toBe('library-missing');
    expect(card.library).toBe('test.plotly');
    expect(card.libraries).toEqual(['test.plotly']);
  });

  it('names an explorable no package defines by its id', () => {
    expect(explorableCard(testProject(), 'gone.chart')).toEqual({
      explorable: 'gone.chart',
      name: 'gone.chart',
      libraries: [],
      reason: 'unknown',
    });
  });

  it('has a sentence for every reason', () => {
    for (const why of Object.values(EXPLORABLE_CARD_WHY)) expect(why.length).toBeGreaterThan(10);
  });
});
