/**
 * Claude's proposal on the sample `my-systems`, as the program shows it to an app (ADR 0073), for the
 * review's tests: worked out by the core, as the program works it out.
 */
import {
  operationsBetween,
  propose,
  proposalChanges,
  type Command,
  type ProjectSnapshot,
  type ProposalShownMessage,
} from '@visual-anything/core';
import { loadSample } from './sample';

export type ShownProposal = ProposalShownMessage['proposal'];

/** Renames the WhatsApp channel. */
export const RENAME_WHATSAPP: Command = {
  type: 'update-element',
  id: 'whatsapp',
  changes: { name: 'WhatsApp Business' },
};

/** Adds an SMS channel, and a relation from it to the WhatsApp channel, which needs it. */
export const ADD_SMS: Command = {
  type: 'batch',
  label: 'Add the SMS channel',
  commands: [
    {
      type: 'create-element',
      element: { id: 'sms', component: 'systems.chat-channel', name: 'SMS' },
    },
    {
      type: 'create-relation',
      relation: {
        id: 'sms-to-whatsapp',
        relationType: 'systems.communicates-with',
        from: 'sms',
        to: 'whatsapp',
      },
    },
  ],
};

export interface SampleProposal {
  base: ProjectSnapshot;
  proposed: ProjectSnapshot;
  shown: ShownProposal;
}

/**
 * The proposal of Claude's commands on a project, the sample unless given, shown at a revision; with
 * `opened`, the project when it opened, which tells what the person changed too.
 */
export function sampleProposal(
  commands: readonly Command[] = [RENAME_WHATSAPP, ADD_SMS],
  { base = loadSample(), revision = 1, id = 'proposal-1' } = {},
): SampleProposal {
  let open;
  let made = 0;
  for (const command of commands) {
    const outcome = propose(open, base, command, {
      author: 'claude',
      newId: (prefix) => `${prefix}-${(made += 1)}`,
    });
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    open = outcome.proposal;
  }
  if (open === undefined) throw new Error('The commands changed nothing.');
  const listed = proposalChanges(open);
  return {
    base,
    proposed: open.proposed,
    shown: {
      id,
      revision,
      labels: [...open.labels],
      operations: operationsBetween(open.base, open.proposed),
      changes: listed.changes.map(({ key, change, needs, changedByYou }) => ({
        key,
        change,
        needs,
        changedByYou,
      })),
      names: listed.comparison.names,
    },
  };
}
