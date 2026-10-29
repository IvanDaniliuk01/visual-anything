/**
 * Claude's tools for its proposal (ADR 0073): `read_proposal` says whether one waits for the person's
 * review, with its changes, or how the last one ended; `withdraw_proposal` closes Claude's own. Claude
 * never accepts or refuses a proposal: only the person does, in the app. Every read tool's answer says
 * when it includes changes not yet applied, through {@link proposalNote}.
 */
import type { ItemRef } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Program, ShownProposal } from './bridge';
import { DELETE, READ, fail, ok, sentences, tool } from './kit';
import type { Tool } from './tools';

/** The most changes `read_proposal` lists, and the most paths it gives for one. */
export const MAX_CHANGES_READ = 500;
const MAX_PATHS = 20;

/** The note every read tool's answer carries while Claude's proposal waits. */
export function proposalNote(proposal: Id): string {
  return `This includes the changes of your proposal "${proposal}", not yet applied: they wait for the person's review. read_proposal lists them.`;
}

/**
 * The note a read tool's answer gets while Claude's proposal waits, or undefined: read before the
 * answer, from the program's own copy, so that it needs no round trip.
 */
export async function proposalNoteOf(program: Program): Promise<string | undefined> {
  if (program.proposal === undefined) return undefined;
  const state = await program.proposal();
  return state.open === undefined ? undefined : proposalNote(state.open.id);
}

/** The id an item is named by, for its name in the comparison. */
function idOf(ref: ItemRef): Id | undefined {
  if ('id' in ref) return ref.id;
  if ('element' in ref) return ref.element;
  if ('view' in ref) return ref.view;
  if ('package' in ref) return ref.package;
  return undefined;
}

/** One change of the proposal as Claude reads it. */
function changeOf(shown: ShownProposal, each: ShownProposal['changes'][number]) {
  const id = idOf(each.change.ref);
  const named = id === undefined ? undefined : shown.names[id];
  const name = named?.after ?? named?.before;
  const paths = each.change.differences.map((difference) => difference.path);
  return {
    key: each.key,
    status: each.change.status,
    ...(name === undefined ? {} : { name }),
    ...(paths.length === 0 ? {} : { differs: paths.slice(0, MAX_PATHS) }),
    ...(each.needs.length === 0 ? {} : { needs: each.needs }),
    ...(each.changedByYou ? { changedByPersonToo: true } : {}),
  };
}

const readProposalTool = tool({
  name: 'read_proposal',
  title: 'Read your proposal',
  description: `Says whether your proposal waits for the person's review, and what it holds; or, when none waits, how the last one ended: accepted, with the changes the person took, refused, withdrawn, or dropped when Visual Anything stopped. It changes nothing.

Your changes wait in a proposal while the person reviews your changes, a choice in their app that no tool reads or changes, or when you pass propose to run_commands. Each later change of yours joins it until the person decides. A waiting proposal lists:
- labels: the labels of your calls that joined it, oldest first;
- changes: each with its key (such as "element:<id> added"), its status (added, removed, changed or moved), the name of what it is about, what differs, the keys of the changes it needs, which the person must accept with it, and changedByPersonToo where the person changed the same thing since you proposed it.

Call it before telling the person what became of your changes, or before building further on them. When the person accepted only some changes, your reads show the project as it then is: build on that.

Example: {}`,
  input: {},
  hints: READ,
  run: async (_args, program) => {
    if (program.proposal === undefined) return fail('This Visual Anything keeps no proposals.');
    const { open, ended } = await program.proposal();
    if (open !== undefined) {
      const changes = open.changes.slice(0, MAX_CHANGES_READ).map((each) => changeOf(open, each));
      return ok({
        waiting: true,
        proposal: open.id,
        labels: open.labels,
        changes,
        ...(open.changes.length > MAX_CHANGES_READ
          ? { moreChanges: open.changes.length - MAX_CHANGES_READ }
          : {}),
        note: 'It waits for the person, who accepts it, all or change by change, or refuses it in the app. Your reads include it, and your next changes join it; withdraw_proposal takes it back.',
      });
    }
    if (ended === undefined) {
      return ok({
        waiting: false,
        note: 'No proposal of yours waits, and none has ended since you attached. Your changes apply at once unless the person reviews them, or you pass propose to run_commands.',
      });
    }
    const accepted = ended.accepted ?? [];
    return ok({
      waiting: false,
      last: {
        proposal: ended.proposal,
        how: ended.how,
        ...(ended.how === 'accepted' ? { accepted } : {}),
      },
      note: {
        accepted:
          'The person accepted these changes, as one action of yours in their history; any others were left out. Your reads show the project as it is now.',
        refused: 'The person refused it: nothing of it was applied.',
        withdrawn: 'You withdrew it: nothing of it was applied.',
        dropped: 'Visual Anything stopped, or could not keep it, before the person decided: nothing of it was applied.',
      }[ended.how],
    });
  },
});

const withdrawProposalTool = tool({
  name: 'withdraw_proposal',
  title: 'Withdraw your proposal',
  description: `Withdraws your proposal that waits for the person's review: nothing of it is applied, every open app stops showing it, and your next change starts a new one, or applies at once if the person does not review your changes. Use it when the person asks you to start over, or when what you proposed is no longer right; to change one thing of it, propose the change instead. You cannot accept or refuse a proposal: only the person does, in the app.

Example: {}`,
  input: {},
  hints: DELETE,
  run: async (_args, program) => {
    if (program.withdrawProposal === undefined) {
      return fail('This Visual Anything keeps no proposals.');
    }
    const answer = await program.withdrawProposal();
    if (!answer.ok) return fail(sentences(answer.problems));
    return ok({
      withdrawn: answer.proposal,
      note: 'Nothing of it was applied. Your reads show the project as it is now.',
    });
  },
});

export const PROPOSAL_TOOLS: readonly Tool[] = [readProposalTool, withdrawProposalTool];
