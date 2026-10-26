/**
 * What the groups of tools kept beside `tools.ts` share: the hints, the inputs every group takes, and
 * how a tool answers, sends a command as one action of Claude's, or sends guidance to the open apps.
 * Each group is a module of its own, and `tools.ts` lists its tools with the others.
 */
import {
  ProtocolError,
  readGuidance,
  type Command,
  type Guidance,
  type Problem,
} from '@visual-anything/core';
import { z } from 'zod';
import type { CommandAnswer, Program } from './bridge';
import type { Tool, ToolHints, ToolOutcome } from './tools';

export function tool<Shape extends z.ZodRawShape>(definition: Tool<Shape>): Tool<Shape> {
  return definition;
}

export const READ: ToolHints = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
export const WRITE: ToolHints = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};
export const DELETE: ToolHints = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
};
export const GUIDE: ToolHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** An id, as the read tools give them. */
export const id = () => z.string().min(1).max(128);

/**
 * Which tab guidance shows another view in (ADR 0029's clarification of 2026-10-26), for the tools
 * whose guidance names a view.
 */
export const ONE_TAB =
  'Another view opens only in the tab the person used last, or the one you opened; their other tabs stay as they are.';

/** The view guidance opens first; left out, the one the person has open. */
export const guidedView = () =>
  id()
    .optional()
    .describe(`The view to open first; left out, the view the person has open. ${ONE_TAB}`);

export function ok(value: unknown): ToolOutcome {
  return { ok: true, value };
}

export function fail(message: string): ToolOutcome {
  return { ok: false, message };
}

export function sentences(problems: readonly Problem[]): string {
  return problems.map((each) => each.message).join(' ');
}

/** A command the program answered as done. */
export type Done = Extract<CommandAnswer, { ok: true }>;

/** What `more` adds to the answer of a command that was done; its `warnings` join the core's. */
export type More = Record<string, unknown> & { warnings?: readonly string[] };

/**
 * Sends a command as Claude's action, and says what was done or why not; `more` adds to the answer
 * of a command that was done, its warnings after the core's, and the warnings of the core it says
 * itself are left out of the rest.
 */
export async function act(
  program: Program,
  command: Command,
  more: (answer: Done) => More | Promise<More> = (answer) =>
    answer.created.length > 0 ? { created: answer.created } : {},
  saidByMore: readonly Problem['code'][] = [],
): Promise<ToolOutcome> {
  const answer = await program.execute(command);
  if (!answer.ok) {
    return fail(
      `Refused, so nothing changed: ${sentences(answer.problems)} (${[...new Set(answer.problems.map((each) => each.code))].join(', ')})`,
    );
  }
  const { warnings: added = [], ...extra } = await more(answer);
  const warnings = [
    ...answer.warnings
      .filter((each) => !saidByMore.includes(each.code))
      .map((each) => each.message),
    ...added,
  ];
  return ok({
    done: answer.changed ? answer.label : 'Nothing changed, so nothing was recorded.',
    ...(answer.changed ? { undo: 'The person can undo it in the app.' } : {}),
    ...extra,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

/**
 * Sends guidance to the open apps, read first as the program reads it so that what it refuses is
 * said plainly, and says whether anyone saw it; `more` adds to the answer.
 */
export async function guideApps(
  program: Program,
  guidance: Guidance,
  more: Record<string, unknown> = {},
): Promise<ToolOutcome> {
  let checked: Guidance;
  try {
    checked = readGuidance(guidance);
  } catch (error) {
    if (error instanceof ProtocolError) return fail(error.message);
    throw error;
  }
  const apps = await program.guide(checked);
  return ok({
    shown: apps,
    ...more,
    ...(apps === 0
      ? {
          note: 'No app has the project open, so nobody sees this. Call open_app to open it in the browser, or ask the person to open it.',
        }
      : {}),
  });
}

/** The object without the keys whose value is undefined. */
export function withoutUndefined<T extends object>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, each]) => each !== undefined),
  ) as never;
}

/** "1 step", "2 steps". */
export function counted(amount: number, one: string, many = `${one}s`): string {
  return `${amount} ${amount === 1 ? one : many}`;
}
