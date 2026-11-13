/** Running commands: each one is checked against the rules and turned into operations. */
import type { Id } from '@visual-anything/schema';
import { checkProject } from '../check';
import { randomIds, type IdGenerator } from '../ids';
import { OperationError, type Operation } from '../operations';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import {
  createPackage,
  defineComponent,
  defineRelationType,
  removeComponent,
  removeRelationType,
  updateComponent,
  updatePackage,
  updateRelationType,
} from './definitions';
import { reorderElements } from './order';
import { setPoses } from './poses';
import { newPoseWarnings } from '../space/pose';
import { addPackage, replacePackage } from './packages';
import { setCollapsed } from './collapse';
import { addToView, leaveOutOfView, setRelationTypesLeftOut, setScope } from './scopes';
import { Draft, Rejection, reject, requireList, requireName } from './draft';
import { newLargeGeometry } from '../geometry/files';
import { newUnknownParts } from '../images/anchored';
import { newSolidWarnings } from '../solids/check';
import { checkImageReferences, defineImage, removeImage } from './images';
import { defineSolid, removeSolid, updateSolid } from './solids';
import {
  checkExplorableReferences,
  dropTextsWithoutDefinitions,
  defineExplorable,
  defineScriptLibrary,
  recordExplorableFile,
  removeExplorable,
  removeScriptLibrary,
  updateExplorable,
  writeExplorable,
} from './explorables';
import {
  createElement,
  createRelation,
  deleteTargets,
  updateElement,
  updateRelation,
} from './model';
import { updateProject } from './project';
import { setDrawingDefaults } from './drawing';
import { setComponentAppearance, setRelationTypeAppearance } from './appearance';
import { resetRoute, setRoute, settleRoutes } from './routes';
import { addOverlay, moveOverlay, removeOverlays, setOverlays, updateOverlay } from './overlays';
import { restack } from './stacking';
import { changeContainer } from './containers';
import { duplicateElements } from './duplicate';
import { setPackageCode } from './code';
import { createScenario, deleteScenario, updateScenario } from './scenarios';
import { addComment, createThread, deleteThread, editComment, resolveThread } from './comments';
import type { Author } from '../history';
import { createTour, deleteTour, updateTour } from './tours';
import { organizeViews } from './view-folders';
import { resolveConflicts } from './conflicts';
import { commandShapeProblems } from './shapes';
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
  /**
   * Who sends the command: Claude's comments are signed as Claude, and only the person's carry their
   * name (ADR 0059). Nothing defaults to the person: a comment command without it is refused.
   */
  author?: Author;
  /** The time now, in milliseconds since 1970, which comments are dated with; the clock by default. */
  now?: () => number;
  /**
   * Present only when the local program runs a command of its own, for a file it read or fetched and
   * checked (ADR 0107): `record-explorable-file` and `define-script-library` are refused without it.
   * The program never sets it for a command that came from an app, Claude or package code.
   */
  program?: true;
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
  const draft = new Draft(state, context.newId ?? randomIds(), {
    ...(context.author === undefined ? {} : { author: context.author }),
    ...(context.now === undefined ? {} : { now: context.now }),
    ...(context.program === true ? { program: true as const } : {}),
  });
  try {
    const label = run(draft, command);
    dropTextsWithoutDefinitions(draft, state);
    checkImageReferences(state, draft.state, draft.operations);
    checkExplorableReferences(state, draft.state, draft.operations);
    draft.seal();
    // Elements the action leaves drawn as a part their picture lacks are drawn as ordinary shapes,
    // and a file it leaves holding past the geometry that slows saving it says so.
    if (draft.operations.length > 0) {
      draft.warnings.push(
        ...newUnknownParts(state, draft.state),
        ...newSolidWarnings(state, draft.state),
        ...newPoseWarnings(state, draft.state),
        ...newLargeGeometry(state, draft.state),
      );
    }
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

/**
 * Applies operations worked out elsewhere, such as the changes of a proposal the person accepts (ADR
 * 0073), as one action checked as a command's is: the views' routes kept true to what they change,
 * the images they show, and no error that `checkProject` finds and the project did not have. Its
 * warnings are those the result has and the project did not.
 */
export function executeOperations(
  state: ProjectSnapshot,
  operations: readonly Operation[],
  label: string,
  context: CommandContext = {},
): CommandOutcome {
  const draft = new Draft(state, context.newId ?? randomIds(), {
    ...(context.author === undefined ? {} : { author: context.author }),
    ...(context.now === undefined ? {} : { now: context.now }),
    ...(context.program === true ? { program: true as const } : {}),
  });
  try {
    for (const operation of operations) draft.apply(operation);
    dropTextsWithoutDefinitions(draft, state);
    settleRoutes(draft, state, 0);
    checkImageReferences(state, draft.state, draft.operations);
    checkExplorableReferences(state, draft.state, draft.operations);
    draft.seal();
    const before = checkProject(state);
    const after = checkProject(draft.state);
    const known = (list: readonly Problem[]) => new Set(list.map((each) => each.message));
    const errors = known(before.errors);
    const broken = after.errors.filter((each) => !errors.has(each.message));
    if (broken.length > 0) return { ok: false, problems: broken };
    const warned = known(before.warnings);
    return {
      ok: true,
      state: draft.state,
      operations: draft.operations,
      inverse: draft.inverse(),
      label,
      warnings: after.warnings.filter((each) => !warned.has(each.message)),
      created: draft.created,
    };
  } catch (error) {
    if (error instanceof Rejection) return { ok: false, problems: error.problems };
    if (error instanceof OperationError) {
      return { ok: false, problems: [problem('invalid-command', error.message)] };
    }
    throw error;
  }
}

/**
 * Runs one command on the draft, then keeps the views' routes true to what it changed (ADR 0039). A
 * batch settles each of its commands as it runs them, so a later one keeps the routes it sets.
 */
function run(draft: Draft, command: Command): string {
  const before = draft.state;
  const start = draft.operations.length;
  const label = dispatch(draft, command);
  if (command.type !== 'batch') settleRoutes(draft, before, start);
  return label;
}

function dispatch(draft: Draft, command: Command): string {
  if (typeof command !== 'object' || command === null || typeof command.type !== 'string') {
    reject('invalid-command', 'A command is an object with a type.');
  }
  // A key it does not take, a field it needs left out, a value of the wrong kind (ADR 0104).
  const malformed = commandShapeProblems(command);
  if (malformed.length > 0) throw new Rejection(malformed);
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
    case 'organize-views':
      return organizeViews(draft, command);
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
    // Duplicates (ADR 0103).
    case 'duplicate-elements':
      return duplicateElements(draft, command);
    case 'update-component':
      return updateComponent(draft, command);
    case 'update-relation-type':
      return updateRelationType(draft, command);
    case 'set-component-appearance':
      return setComponentAppearance(draft, command);
    case 'set-relation-type-appearance':
      return setRelationTypeAppearance(draft, command);
    case 'update-package':
      return updatePackage(draft, command);
    case 'add-package':
      return addPackage(draft, command);
    case 'replace-package':
      return replacePackage(draft, command);
    case 'reorder-elements':
      return reorderElements(draft, command);
    case 'set-poses':
      return setPoses(draft, command);
    case 'set-collapsed':
      return setCollapsed(draft, command);
    case 'set-scope':
      return setScope(draft, command);
    case 'add-to-view':
      return addToView(draft, command);
    case 'leave-out-of-view':
      return leaveOutOfView(draft, command);
    case 'set-relation-types-left-out':
      return setRelationTypesLeftOut(draft, command);
    case 'define-image':
      return defineImage(draft, command);
    case 'remove-image':
      return removeImage(draft, command);
    case 'define-solid':
      return defineSolid(draft, command);
    case 'update-solid':
      return updateSolid(draft, command);
    case 'remove-solid':
      return removeSolid(draft, command);
    // Explorables and script libraries (ADR 0107).
    case 'define-explorable':
      return defineExplorable(draft, command);
    case 'write-explorable':
      return writeExplorable(draft, command);
    case 'record-explorable-file':
      return recordExplorableFile(draft, command);
    case 'update-explorable':
      return updateExplorable(draft, command);
    case 'remove-explorable':
      return removeExplorable(draft, command);
    case 'define-script-library':
      return defineScriptLibrary(draft, command);
    case 'remove-script-library':
      return removeScriptLibrary(draft, command);
    case 'set-route':
      return setRoute(draft, command);
    case 'reset-route':
      return resetRoute(draft, command);
    case 'set-package-code':
      return setPackageCode(draft, command);
    case 'create-tour':
      return createTour(draft, command);
    case 'update-tour':
      return updateTour(draft, command);
    case 'delete-tour':
      return deleteTour(draft, command);
    case 'set-overlays':
      return setOverlays(draft, command);
    case 'set-drawing-defaults':
      return setDrawingDefaults(draft, command);
    case 'add-overlay':
      return addOverlay(draft, command);
    case 'update-overlay':
      return updateOverlay(draft, command);
    case 'remove-overlays':
      return removeOverlays(draft, command);
    case 'move-overlay':
      return moveOverlay(draft, command);
    // Comments (ADR 0059).
    case 'create-thread':
      return createThread(draft, command);
    case 'add-comment':
      return addComment(draft, command);
    case 'edit-comment':
      return editComment(draft, command);
    case 'resolve-thread':
      return resolveThread(draft, command);
    case 'delete-thread':
      return deleteThread(draft, command);
    // Merges (ADR 0072).
    case 'resolve-conflicts':
      return resolveConflicts(draft, command);
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
