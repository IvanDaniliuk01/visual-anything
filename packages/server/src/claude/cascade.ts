/**
 * The gate before a change of Claude's that takes more than it names (ADR-0029): a delete that also
 * deletes the relations ending on what it deletes, or breaks scenario steps, and a change of
 * container that does the same through the nesting relations it takes away, or takes away one with a
 * name, a description or attributes of its own, as the app asks the person first (CLAUDE.md: "after a
 * preview"). Every `delete` and `change-container` is previewed with the core's own previews, those
 * inside a batch over the project as the commands before them in the batch leave it, so that a tool
 * can refuse until Claude passes `cascade: true` and has told the person.
 */
import {
  executeCommand,
  previewChangeContainer,
  previewDelete,
  type Command,
  type CommandContext,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** What the deletes and changes of container of a command take beyond what they name. */
export interface Cascade {
  /** The relations deleted only because they end on something deleted. */
  cascaded: Id[];
  /** The scenario steps that would become broken. */
  brokenSteps: { scenario: Id; step: Id }[];
  /** The nesting relations a change of container takes away that hold data of their own. */
  withData: Id[];
}

/**
 * What the deletes and changes of container in a command would take beyond what they name, each
 * previewed over the project it would meet. A command the core would refuse adds nothing: it is
 * refused when it is sent, and nothing changes.
 */
export function cascadeOf(state: ProjectSnapshot, command: Command): Cascade {
  const found: Cascade = { cascaded: [], brokenSteps: [], withData: [] };
  walk(state, command, found);
  return {
    cascaded: [...new Set(found.cascaded)],
    brokenSteps: unique(found.brokenSteps),
    withData: [...new Set(found.withData)],
  };
}

/** Whether a cascade takes anything, so that the change waits for `cascade: true`. */
export function takesMore(cascade: Cascade): boolean {
  return (
    cascade.cascaded.length > 0 || cascade.brokenSteps.length > 0 || cascade.withData.length > 0
  );
}

/**
 * Why a change that takes more than it names was not made, in the words of `delete_from_model`:
 * `refused` opens it, such as "Not deleted", and `endsOn` says what the relations end on.
 */
export function cascadeRefusal(cascade: Cascade, refused: string, endsOn: string): string {
  const data =
    cascade.withData.length === 0
      ? ''
      : ` It would also take away ${cascade.withData.length} nesting relation(s) with a name, a description or attributes of their own (${cascade.withData.join(', ')}).`;
  return `${refused}: this would also delete ${cascade.cascaded.length} relation(s) that end on ${endsOn} (${cascade.cascaded.join(', ') || 'none'}) and mark ${cascade.brokenSteps.length} scenario step(s) broken.${data} Tell the person, then call again with cascade: true.`;
}

/**
 * How the commands before a delete in a batch are run to preview it: as Claude's, as the real run
 * signs them, since the core refuses a comment command whose sender is not said (ADR 0059). The time
 * is any a comment can keep: nothing previewed depends on it.
 */
const AS_CLAUDE: CommandContext = { author: 'claude', now: () => 0 };

function walk(state: ProjectSnapshot, command: Command, found: Cascade): void {
  try {
    switch (command.type) {
      case 'delete': {
        const preview = previewDelete(state, {
          ...(Array.isArray(command.elements) ? { elements: command.elements } : {}),
          ...(Array.isArray(command.relations) ? { relations: command.relations } : {}),
        });
        if (preview.problems.length > 0) return;
        found.cascaded.push(...preview.cascaded);
        found.brokenSteps.push(...preview.brokenSteps);
        return;
      }
      case 'change-container': {
        const preview = previewChangeContainer(state, command);
        if (preview.problems.length > 0) return;
        found.cascaded.push(...preview.cascaded);
        found.brokenSteps.push(...preview.brokenSteps);
        found.withData.push(...preview.withData);
        return;
      }
      case 'batch': {
        const commands: readonly Command[] = Array.isArray(command.commands)
          ? command.commands
          : [];
        // The project as the commands before the one previewed leave it.
        let current = state;
        let reached = 0;
        for (const [at, each] of commands.entries()) {
          if (!cascades(each)) continue;
          if (at > reached) {
            const ran = executeCommand(
              current,
              { type: 'batch', label: command.label, commands: commands.slice(reached, at) },
              AS_CLAUDE,
            );
            if (!ran.ok) return;
            current = ran.state;
            reached = at;
          }
          walk(current, each, found);
        }
        return;
      }
      default:
        return;
    }
  } catch {
    // A command not well formed is refused when it is sent; it previews as taking nothing.
  }
}

/** Whether a command deletes or changes containers, itself or in a batch it holds. */
function cascades(command: unknown): command is Command {
  if (typeof command !== 'object' || command === null) return false;
  const { type, commands } = command as { type?: unknown; commands?: unknown };
  if (type === 'delete' || type === 'change-container') return true;
  return type === 'batch' && Array.isArray(commands) && commands.some(cascades);
}

function unique(steps: readonly { scenario: Id; step: Id }[]): { scenario: Id; step: Id }[] {
  const seen = new Set<string>();
  return steps.filter((each) => {
    const key = JSON.stringify([each.scenario, each.step]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
