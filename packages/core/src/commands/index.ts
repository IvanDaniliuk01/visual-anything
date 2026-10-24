/** Running commands: each one is checked against the rules and turned into operations. */
import type { Id } from '@visual-anything/schema';
import { randomIds, type IdGenerator } from '../ids';
import type { Operation } from '../operations';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import {
  createPackage,
  defineComponent,
  defineRelationType,
  removeComponent,
  removeRelationType,
} from './definitions';
import { Draft, Rejection, reject, requireList, requireName } from './draft';
import {
  createElement,
  createRelation,
  deleteTargets,
  updateElement,
  updateRelation,
} from './model';
import { updateProject } from './project';
import { restack } from './stacking';
import { changeContainer } from './containers';
import { createScenario, deleteScenario, updateScenario } from './scenarios';
import type { Command } from './types';
import {
  createFreeShape,
  createView,
  deleteFreeShapes,
  deleteView,
  removePositions,
  setPositions,
  updateFreeShape,
  updateView,
} from './views';

export type * from './types';
export { previewChangeContainer, type ContainerChangePreview } from './containers';

/** What running a command needs besides the project. */
export interface CommandContext {
  /** Makes new ids; random suffixes by default. */
  newId?: IdGenerator;
}

/** What running a command produced. */
export type CommandOutcome =
  | {
      ok: true;
      /** The project after the command. */
      state: ProjectSnapshot;
      /** What changed, in order. Empty when the command changed nothing. */
      operations: Operation[];
      /** The operations that undo it, in the order to apply them. */
      inverse: Operation[];
      /** How the undo history names the action. */
      label: string;
      /** Rules that only warn, such as relation type limits, that the result breaks. */
      warnings: Problem[];
      /** The ids of what it created, in order. */
      created: Id[];
    }
  | { ok: false; problems: Problem[] };

/**
 * Runs a command on a project. Either everything it does is kept, or nothing is and the problems say
 * why. The project passed in is never changed.
 */
export function executeCommand(
  state: ProjectSnapshot,
  command: Command,
  context: CommandContext = {},
): CommandOutcome {
  const draft = new Draft(state, context.newId ?? randomIds());
  try {
    const label = run(draft, command);
    return {
      ok: true,
      state: draft.state,
      operations: draft.operations,
      inverse: draft.inverse(),
      label,
      warnings: draft.warnings,
      created: draft.created,
    };
  } catch (error) {
    if (error instanceof Rejection) return { ok: false, problems: error.problems };
    // A command missing a part, or with a part of the wrong kind, fails where the core first reads
    // it; it is refused as not well formed, and the project is unchanged as for any refusal.
    if (error instanceof TypeError) {
      return {
        ok: false,
        problems: [problem('invalid-command', `The command is not well formed: ${error.message}`)],
      };
    }
    throw error;
  }
}

function run(draft: Draft, command: Command): string {
  if (typeof command !== 'object' || command === null || typeof command.type !== 'string') {
    reject('invalid-command', 'A command is an object with a type.');
  }
  switch (command.type) {
    case 'create-element':
      return createElement(draft, command);
    case 'update-element':
      return updateElement(draft, command);
    case 'delete':
      return deleteTargets(draft, command);
    case 'create-relation':
      return createRelation(draft, command);
    case 'update-relation':
      return updateRelation(draft, command);
    case 'create-package':
      return createPackage(draft, command);
    case 'define-component':
      return defineComponent(draft, command);
    case 'remove-component':
      return removeComponent(draft, command);
    case 'define-relation-type':
      return defineRelationType(draft, command);
    case 'remove-relation-type':
      return removeRelationType(draft, command);
    case 'create-view':
      return createView(draft, command);
    case 'update-view':
      return updateView(draft, command);
    case 'delete-view':
      return deleteView(draft, command);
    case 'set-positions':
      return setPositions(draft, command);
    case 'remove-positions':
      return removePositions(draft, command);
    case 'create-free-shape':
      return createFreeShape(draft, command);
    case 'update-free-shape':
      return updateFreeShape(draft, command);
    case 'delete-free-shapes':
      return deleteFreeShapes(draft, command);
    case 'create-scenario':
      return createScenario(draft, command);
    case 'update-scenario':
      return updateScenario(draft, command);
    case 'delete-scenario':
      return deleteScenario(draft, command);
    case 'update-project':
      return updateProject(draft, command);
    case 'restack':
      return restack(draft, command);
    case 'change-container':
      return changeContainer(draft, command);
    case 'batch': {
      const label = requireName(command.label, 'A batch');
      const commands = requireList(command.commands, 'commands');
      if (commands.length === 0) reject('invalid-command', 'A batch needs at least one command.');
      commands.forEach((each, position) => {
        try {
          run(draft, each);
        } catch (error) {
          if (!(error instanceof Rejection)) throw error;
          throw new Rejection(
            error.problems.map((each) =>
              problem(
                each.code,
                `Command ${position + 1} of the batch: ${each.message}`,
                each.subjects,
              ),
            ),
          );
        }
      });
      return label;
    }
    default:
      reject(
        'invalid-command',
        `"${String((command as { type: unknown }).type)}" is not a command.`,
      );
  }
}
