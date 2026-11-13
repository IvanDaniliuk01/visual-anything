/**
 * Proposals and explorables (ADR 0073, ADR 0107, A10's review): no command that writes an explorable
 * joins a proposal; the texts a proposal's versions hold are the project's, so a rebase after the
 * person changed one keeps it; accepting all of a proposal or some of it leaves every definition with
 * the text its hash names, and takes the texts of the explorables whose package it removes.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../commands';
import { explorableTextHash, explorablesIn } from '../explorables';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { testProject } from '../test/fixtures';
import { operationsBetween } from './operations-between';
import {
  EXPLORABLE_WRITES,
  acceptProposal,
  propose,
  proposalChanges,
  rebaseProposal,
  type Proposal,
} from './proposals';

let made = 0;
const newId = (base: string) => `${base}-x${(made += 1)}`;

function done(state: ProjectSnapshot, command: Command, program = false) {
  const outcome = executeCommand(state, command, {
    newId,
    author: 'claude',
    ...(program ? { program: true as const } : {}),
  });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

function proposed(project: ProjectSnapshot, ...commands: Command[]): Proposal {
  let proposal: Proposal | undefined;
  for (const command of commands) {
    const outcome = propose(proposal, project, command, { newId });
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    proposal = outcome.proposal;
  }
  if (!proposal) throw new Error('Nothing was proposed.');
  return proposal;
}

/** Every text has its definition, and every definition's hash is its text's when it has one. */
function expectTextsMatch(state: ProjectSnapshot) {
  const catalog = explorablesIn(state);
  for (const text of state.explorableTexts ?? []) {
    expect(catalog.explorable(text.id)?.definition.hash).toBe(explorableTextHash(text.text));
  }
}

/** The test project with an explorable in its package, and a second package "notes" with one too. */
function withExplorables(): ProjectSnapshot {
  let state = done(testProject(), {
    type: 'define-explorable',
    package: 'test',
    explorable: { id: 'test.curve', name: 'Curve' },
    text: '<p>curve</p>',
  }).state;
  state = done(state, {
    type: 'create-package',
    package: { id: 'notes', name: 'Notes' },
  }).state;
  return done(state, {
    type: 'define-explorable',
    package: 'notes',
    explorable: { id: 'notes.sketch', name: 'Sketch' },
    text: '<p>sketch</p>',
  }).state;
}

describe('explorables never join a proposal', () => {
  it('refuses every command that writes one, alone or in a batch, saying it is written directly', () => {
    const project = withExplorables();
    const commands: Command[] = [
      {
        type: 'define-explorable',
        package: 'test',
        explorable: { name: 'New' },
        text: '<p>new</p>',
      },
      { type: 'write-explorable', id: 'test.curve', text: '<p>changed</p>' },
      { type: 'update-explorable', id: 'test.curve', changes: { name: 'Renamed' } },
      { type: 'remove-explorable', id: 'test.curve' },
    ];
    expect(commands.map((each) => each.type).sort()).toEqual([...EXPLORABLE_WRITES].sort());
    for (const command of commands) {
      const alone = propose(undefined, project, command, { newId });
      expect(alone.ok ? [] : alone.problems.map((each) => each.message)).toEqual([
        expect.stringContaining('An explorable never joins a proposal'),
      ]);
      const open = proposed(project, {
        type: 'update-element',
        id: 'api',
        changes: { name: 'Gateway' },
      });
      const batched = propose(
        open,
        project,
        {
          type: 'batch',
          label: 'Both',
          commands: [{ type: 'update-element', id: 'db', changes: { name: 'Store' } }, command],
        },
        { newId },
      );
      expect(batched.ok).toBe(false);
    }
  });
});

describe('a proposal’s texts', () => {
  it('follow the project’s through a rebase, and accepting keeps every definition with its text', () => {
    const project = withExplorables();
    const proposal = proposed(project, {
      type: 'update-element',
      id: 'api',
      changes: { name: 'Gateway' },
    });
    // Written directly while the proposal waits, as Claude's write or the person's file.
    const now = done(project, {
      type: 'write-explorable',
      id: 'test.curve',
      text: '<p>written now</p>',
    });
    const rebased = rebaseProposal(proposal, now.state, now.operations);
    expect(rebased.proposed.explorableTexts).toEqual(now.state.explorableTexts);
    expectTextsMatch(rebased.proposed);
    // Nothing about texts is shown as a change of the proposal.
    expect(operationsBetween(rebased.base, rebased.proposed)).not.toContainEqual(
      expect.objectContaining({ collection: { name: 'explorableTexts' } }),
    );
    for (const accepted of ['all', ['element:api changed']] as const) {
      const outcome = acceptProposal(proposal, now.state, accepted);
      if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
      expect(outcome.state.explorableTexts).toEqual(now.state.explorableTexts);
      expectTextsMatch(outcome.state);
    }
  });

  it('go with the package a proposal stops using, when that change is accepted, and undo gives them back', () => {
    const project = withExplorables();
    const packages = project.project.packages.filter((each) => each !== 'notes');
    const proposal = proposed(project, { type: 'update-project', changes: { packages } });
    expect(proposal.proposed.explorableTexts?.map((each) => each.id)).toEqual(['test.curve']);
    const outcome = acceptProposal(proposal, project, 'all');
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    expect(outcome.state.explorableTexts?.map((each) => each.id)).toEqual(['test.curve']);
    expectTextsMatch(outcome.state);
    expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(project);
  });

  it('match their definitions after any accepted choice, while texts are written directly meanwhile', () => {
    const changes: Command[] = [
      { type: 'update-element', id: 'api', changes: { name: 'Gateway' } },
      { type: 'update-element', id: 'db', changes: { description: 'Rows.' } },
      {
        type: 'update-project',
        changes: {
          packages: withExplorables().project.packages.filter((each) => each !== 'notes'),
        },
      },
    ];
    const writes = fc.array(
      fc.record({
        id: fc.constantFrom('test.curve', 'notes.sketch'),
        text: fc.string({ maxLength: 20 }),
        program: fc.boolean(),
      }),
      { maxLength: 3 },
    );
    fc.assert(
      fc.property(
        fc.subarray(changes, { minLength: 1 }),
        writes,
        fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
        (commands, written, picks) => {
          const project = withExplorables();
          const proposal = proposed(project, ...commands);
          let now = project;
          for (const write of written) {
            const outcome = executeCommand(
              now,
              write.program
                ? { type: 'record-explorable-file', id: write.id, text: write.text }
                : { type: 'write-explorable', id: write.id, text: write.text },
              {
                newId,
                author: write.program ? 'user' : 'claude',
                program: write.program || undefined,
              },
            );
            if (outcome.ok) now = outcome.state;
          }
          const rebased = rebaseProposal(proposal, now);
          expectTextsMatch(rebased.proposed);
          const keys = proposalChanges(rebased).changes;
          const chosen = keys.filter((_, at) => picks[at % picks.length]).map((each) => each.key);
          // A choice that leaves out what a change needs is refused whole; any other keeps the rule.
          const outcome = acceptProposal(proposal, now, chosen);
          if (!outcome.ok) return;
          expectTextsMatch(outcome.state);
          // Every text of an explorable the result still defines is the project's, as it was.
          for (const text of outcome.state.explorableTexts ?? []) {
            expect(now.explorableTexts).toContainEqual(text);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
