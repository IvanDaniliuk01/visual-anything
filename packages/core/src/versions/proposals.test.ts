/**
 * Proposals (ADR 0073): Claude's commands run on the proposed project and never on the project now;
 * accepting every change gives the proposed project and accepting none changes nothing; any choice
 * closed under what its changes need keeps every rule; undoing the accepted action gives back the
 * project before it; and a rebase after the person's actions keeps every change of Claude's that
 * they do not touch.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command } from '../commands';
import { randomIds } from '../ids';
import { applyOperations, type Operation } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { testProject } from '../test/fixtures';
import { commandFor, intent, propertyProject, type Intent } from '../test/random-commands';
import { compareProjects } from './compare';
import { itemKey, projectItems, sameValue } from './items';
import {
  acceptProposal,
  acceptedLabel,
  propose,
  proposalChanges,
  rebaseProposal,
  type Proposal,
  type ProposalChange,
} from './proposals';

let made = 0;
const context = { newId: (base: string) => `${base}-c${(made += 1)}` };

function proposed(project: ProjectSnapshot, ...commands: Command[]): Proposal {
  let proposal: Proposal | undefined;
  for (const command of commands) {
    const outcome = propose(proposal, project, command, context);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    proposal = outcome.proposal;
  }
  if (!proposal) throw new Error('Nothing was proposed.');
  return proposal;
}

function done(state: ProjectSnapshot, command: Command) {
  const outcome = executeCommand(state, command, { newId: (base) => `${base}-p${(made += 1)}` });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

const keys = (changes: readonly ProposalChange[]) => changes.map((each) => each.key);

describe('propose', () => {
  it('runs Claude’s commands on the proposed project, and never on the project now', () => {
    const project = testProject();
    const proposal = proposed(
      project,
      { type: 'update-element', id: 'api', changes: { name: 'Gateway' } },
      {
        type: 'create-element',
        element: { id: 'cache', component: 'test.database', name: 'Cache' },
      },
    );
    expect(project).toEqual(testProject());
    expect(proposal.base).toBe(project);
    expect(proposal.opened).toBe(project);
    expect(proposal.labels).toEqual(['Rename "API" to "Gateway"', 'Create "Cache"']);
    expect(proposal.proposed.model.elements.map((each) => each.name)).toContain('Gateway');
    expect(keys(proposalChanges(proposal).changes)).toEqual([
      'element:api changed',
      'element:cache added',
    ]);
  });

  it('opens no proposal for a command that changes nothing, and refuses what the core refuses', () => {
    const project = testProject();
    const unchanged = propose(undefined, project, {
      type: 'update-element',
      id: 'api',
      changes: { name: 'API' },
    });
    expect(unchanged.ok && unchanged.proposal).toBeUndefined();
    const refused = propose(undefined, project, {
      type: 'update-element',
      id: 'nothing',
      changes: { name: 'X' },
    });
    expect(refused.ok).toBe(false);
  });

  it('never proposes a comment, or the resolving of conflicts', () => {
    const project = testProject();
    const comment = propose(undefined, project, {
      type: 'create-thread',
      anchor: { kind: 'element', element: 'api' },
      text: 'Why?',
    } as unknown as Command);
    expect(comment.ok ? [] : comment.problems.map((each) => each.message)).toEqual([
      'A comment never joins a proposal: it is added to the project now, signed as Claude.',
    ]);
    const resolve = propose(undefined, project, {
      type: 'batch',
      commands: [{ type: 'resolve-conflicts', file: { kind: 'model' }, resolutions: [] }],
    } as unknown as Command);
    expect(resolve.ok).toBe(false);
  });
});

describe('proposalChanges', () => {
  it('says what each change needs: a relation its new end, a removal the removals it takes', () => {
    const project = testProject();
    const proposal = proposed(
      project,
      {
        type: 'create-element',
        element: { id: 'cache', component: 'test.database', name: 'Cache' },
      },
      {
        type: 'create-relation',
        relation: { id: 'api-reads-cache', relationType: 'test.reads', from: 'api', to: 'cache' },
      },
      { type: 'delete', elements: ['client'] },
    );
    const changes = new Map(proposalChanges(proposal).changes.map((each) => [each.key, each]));
    expect(changes.get('relation:api-reads-cache added')?.needs).toEqual(['element:cache added']);
    // Deleting the client takes its call, and the contract that governs the call.
    expect(changes.get('element:client removed')?.needs.sort()).toEqual(
      ['relation:client-calls-api removed'].sort(),
    );
    expect(changes.get('relation:client-calls-api removed')?.needs).toEqual([
      'relation:contract-governs-call removed',
    ]);
  });

  it('marks the changes whose items the person changed too', () => {
    const project = testProject();
    const proposal = proposed(project, {
      type: 'update-element',
      id: 'api',
      changes: { description: 'The front door.' },
    });
    const now = done(project, { type: 'update-element', id: 'api', changes: { name: 'Edge' } });
    const rebased = rebaseProposal(proposal, now.state, now.operations);
    const [change] = proposalChanges(rebased).changes;
    expect(change?.key).toBe('element:api changed');
    expect(change?.changedByYou).toBe(true);
    // Both edits stand, each in its own key.
    const api = rebased.proposed.model.elements.find((each) => each.id === 'api');
    expect(api).toMatchObject({ name: 'Edge', description: 'The front door.' });
  });
});

describe('rebaseProposal', () => {
  it('keeps what Claude’s change needs that the person removed', () => {
    const project = testProject();
    const proposal = proposed(project, {
      type: 'create-relation',
      relation: { id: 'db-reads-db', relationType: 'test.calls', from: 'client', to: 'db' },
    });
    const now = done(project, { type: 'delete', elements: ['db'] });
    const rebased = rebaseProposal(proposal, now.state, now.operations);
    expect(rebased.proposed.model.elements.map((each) => each.id)).toContain('db');
    const changes = proposalChanges(rebased).changes;
    expect(changes.find((each) => each.key === 'element:db added')?.changedByYou).toBe(true);
  });

  it('keeps Claude’s removal of what the person changed, for the person to choose', () => {
    const project = testProject();
    const proposal = proposed(project, { type: 'delete', elements: ['contract'] });
    const now = done(project, { type: 'update-element', id: 'contract', changes: { name: 'SLA' } });
    const rebased = rebaseProposal(proposal, now.state, now.operations);
    expect(rebased.proposed.model.elements.map((each) => each.id)).not.toContain('contract');
    const removal = proposalChanges(rebased).changes.find(
      (each) => each.key === 'element:contract removed',
    );
    expect(removal?.changedByYou).toBe(true);
  });
});

describe('acceptProposal', () => {
  it('makes one action of Claude’s, named by Claude’s labels', () => {
    const project = testProject();
    const proposal = proposed(
      project,
      { type: 'update-element', id: 'api', changes: { name: 'Gateway' } },
      {
        type: 'create-element',
        element: { id: 'cache', component: 'test.database', name: 'Cache' },
      },
    );
    const all = acceptProposal(proposal, project, 'all');
    if (!all.ok) throw new Error('refused');
    expect(all.label).toBe('Rename "API" to "Gateway" and 1 more');
    expect(all.state).toEqual(proposal.proposed);
    expect(all.created).toEqual(['cache']);
    const some = acceptProposal(proposal, project, ['element:cache added']);
    if (!some.ok) throw new Error('refused');
    expect(some.label).toBe('Rename "API" to "Gateway" and 1 more (1 of 2 changes)');
    expect(some.state.model.elements.find((each) => each.id === 'api')?.name).toBe('API');
    expect(some.state.model.elements.map((each) => each.id)).toContain('cache');
  });

  it('refuses a change it does not hold, and a choice that leaves out what a change needs', () => {
    const project = testProject();
    const proposal = proposed(
      project,
      {
        type: 'create-element',
        element: { id: 'cache', component: 'test.database', name: 'Cache' },
      },
      {
        type: 'create-relation',
        relation: { id: 'api-reads-cache', relationType: 'test.reads', from: 'api', to: 'cache' },
      },
    );
    const unknown = acceptProposal(proposal, project, ['element:nothing added']);
    expect(unknown.ok ? [] : unknown.problems.map((each) => each.message)).toEqual([
      'The proposal holds no change "element:nothing added".',
    ]);
    const open = acceptProposal(proposal, project, ['relation:api-reads-cache added']);
    expect(open.ok ? [] : open.problems.map((each) => each.message)).toEqual([
      'The change "relation:api-reads-cache added" needs the change "element:cache added", which is not accepted.',
    ]);
  });

  it('names how many changes were accepted of how many', () => {
    expect(acceptedLabel(['Create “Payments”', 'a', 'b', 'c', 'd'], 3, 5)).toBe(
      'Create “Payments” and 4 more (3 of 5 changes)',
    );
    expect(acceptedLabel(['Create “Payments”'], 1, 1)).toBe('Create “Payments”');
  });
});

// ——— Properties ———

function generator(seed: number, prefix: string) {
  let random = seed;
  const ids = randomIds(() => {
    random = (random * 1103515245 + 12345) % 2147483648;
    return Math.abs(random) / 2147483648;
  });
  return (base: string) => `${prefix}${ids(base)}`;
}

/** A project after some random actions of the person's, with their operations. */
function evolve(start: ProjectSnapshot, wishes: readonly Intent[], seed: number) {
  const newId = generator(seed, '');
  let state = start;
  const operations: Operation[] = [];
  for (const wish of wishes) {
    if (wish.kind === 'undo' || wish.kind === 'redo') continue;
    const command = commandFor(state, wish);
    if (!command) continue;
    const outcome = executeCommand(state, command, { newId });
    if (!outcome.ok) continue;
    state = outcome.state;
    operations.push(...outcome.operations);
  }
  return { state, operations };
}

/** Claude's random commands, proposed on a project. */
function proposing(project: ProjectSnapshot, wishes: readonly Intent[], seed: number) {
  const newId = generator(seed, 'c');
  let proposal: Proposal | undefined;
  for (const wish of wishes) {
    if (wish.kind === 'undo' || wish.kind === 'redo') continue;
    const command = commandFor(proposal?.proposed ?? project, wish);
    if (!command) continue;
    const outcome = propose(proposal, project, command, { newId });
    if (outcome.ok) proposal = outcome.proposal;
  }
  return proposal;
}

const proposals = fc
  .tuple(
    fc.array(intent, { minLength: 0, maxLength: 15 }),
    fc.array(intent, { minLength: 1, maxLength: 20 }),
    fc.integer(),
  )
  .map(([first, claude, seed]) => {
    const project = evolve(propertyProject(), first, seed).state;
    return { project, proposal: proposing(project, claude, seed + 1) };
  });

/** Some changes, with everything they need. */
function closed(changes: readonly ProposalChange[], picks: readonly boolean[]): string[] {
  const byKey = new Map(changes.map((each) => [each.key, each]));
  const chosen = new Set(
    changes
      .filter((_, at) => picks[at % Math.max(1, picks.length)] === true)
      .map((each) => each.key),
  );
  const pending = [...chosen];
  while (pending.length > 0) {
    for (const need of byKey.get(pending.pop() as string)?.needs ?? []) {
      if (!chosen.has(need)) {
        chosen.add(need);
        pending.push(need);
      }
    }
  }
  return [...chosen];
}

const errorsOf = (state: ProjectSnapshot) =>
  new Set(checkProject(state).errors.map((each) => each.message));

describe('proposals, for any of Claude’s commands', () => {
  it('give the proposed project when every change is accepted, and nothing when none is', () => {
    fc.assert(
      fc.property(proposals, ({ project, proposal }) => {
        if (!proposal) return;
        const all = acceptProposal(proposal, project, 'all');
        if (!all.ok) throw new Error(all.problems.map((each) => each.message).join(' '));
        expect(all.state).toEqual(proposal.proposed);
        const none = acceptProposal(proposal, project, []);
        if (!none.ok) throw new Error('refused');
        expect(none.state).toBe(project);
        expect(none.operations).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });

  it('keep every rule for any choice closed under what its changes need, and undo exactly', () => {
    fc.assert(
      fc.property(
        proposals,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }),
        ({ project, proposal }, picks) => {
          if (!proposal) return;
          const chosen = closed(proposalChanges(proposal).changes, picks);
          const outcome = acceptProposal(proposal, project, chosen);
          if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
          const before = errorsOf(project);
          expect([...errorsOf(outcome.state)].filter((each) => !before.has(each))).toEqual([]);
          expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(project);
          // What was accepted is in the result as Claude proposed it.
          const result = projectItems(outcome.state);
          const wanted = projectItems(proposal.proposed);
          const accepted = new Set(chosen);
          for (const change of proposalChanges(proposal).changes) {
            if (!accepted.has(change.key)) continue;
            for (const ref of change.change.items) {
              const key = itemKey(ref);
              if (ref.kind === 'stacking' || ref.kind === 'order') continue;
              expect(sameValue(result.get(key)?.value, wanted.get(key)?.value), key).toBe(true);
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('keep every change of Claude’s that the person’s actions do not touch, through a rebase', () => {
    fc.assert(
      fc.property(
        proposals,
        fc.array(intent, { minLength: 1, maxLength: 10 }),
        fc.integer(),
        ({ project, proposal }, person, seed) => {
          if (!proposal) return;
          const now = evolve(project, person, seed + 7);
          const rebased = rebaseProposal(proposal, now.state, now.operations);
          expect(rebased.base).toBe(now.state);
          // Rebasing by the operations equals rebasing every file.
          expect(rebased.proposed).toEqual(rebaseProposal(proposal, now.state).proposed);
          const before = projectItems(project);
          const after = projectItems(now.state);
          const touched = new Set(
            [...new Set([...before.keys(), ...after.keys()])].filter(
              (key) => !sameValue(before.get(key)?.value, after.get(key)?.value),
            ),
          );
          const claude = projectItems(proposal.proposed);
          const kept = projectItems(rebased.proposed);
          for (const change of compareProjects(project, proposal.proposed).changes) {
            const keys = change.items.map(itemKey);
            if (keys.some((key) => touched.has(key))) continue;
            for (const key of keys) {
              if (key === 'order' || key.startsWith('stacking:')) continue;
              expect(sameValue(kept.get(key)?.value, claude.get(key)?.value), key).toBe(true);
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
