/**
 * What package code's runs say to the person (ADR 0054), in English, as the core writes every message;
 * the app translates them through its templates. Errors are the package's: they show as warnings on
 * the package and on the element, never as a crash.
 */
import type { Id } from '@visual-anything/schema';
import { problem, type Problem } from '../problems';
import { CODE_LIMITS } from './limits';

/** The hooks package code may export. */
export type HookName = 'attributes' | 'check' | 'draw' | 'simulate';

export const HOOK_NAMES: readonly HookName[] = Object.freeze([
  'attributes',
  'check',
  'draw',
  'simulate',
]);

/** How a call of package code, or the loading of its module, ended badly. */
export type CodeFailure =
  /** The code threw, or its module could not be read; `message` is the engine's or the code's. */
  | { kind: 'threw'; message: string }
  /** It ran past its time. */
  | { kind: 'time' }
  /** It took more memory than its package may hold. */
  | { kind: 'memory' }
  /** It answered something that is not plain data within its cap. */
  | { kind: 'answer'; reason: string };

/** A named thing a message is about: a package, or an element. */
export interface Named {
  id: Id;
  name: string;
}

/** The problem one call of a hook ran into, on the package and the element. */
export function callProblem(
  pkg: Named,
  hook: HookName,
  element: Named,
  failure: CodeFailure,
): Problem {
  const subjects = [pkg.id, element.id];
  const where = `in ${hook} on ${JSON.stringify(element.name)}`;
  const of = `The code of the package ${JSON.stringify(pkg.name)}`;
  switch (failure.kind) {
    case 'threw':
      return problem('code-failed', `${of} failed ${where}: ${oneLine(failure.message)}`, subjects);
    case 'time':
      return problem('code-stopped', `${of} was stopped ${where}: ${PAST_TIME}`, subjects);
    case 'memory':
      return problem('code-stopped', `${of} was stopped ${where}: ${PAST_MEMORY}`, subjects);
    case 'answer':
      return problem(
        'code-answer-dropped',
        `The answer of ${hook} from the package ${JSON.stringify(pkg.name)} on ${JSON.stringify(element.name)} was dropped: ${failure.reason}.`,
        subjects,
      );
  }
}

/** The problem loading a package's module ran into. */
export function loadProblem(pkg: Named, failure: CodeFailure): Problem {
  const of = `The code of the package ${JSON.stringify(pkg.name)}`;
  switch (failure.kind) {
    case 'threw':
      return problem('code-failed', `${of} did not load: ${oneLine(failure.message)}`, [pkg.id]);
    case 'time':
      return problem('code-stopped', `${of} was stopped as it loaded: ${PAST_TIME}`, [pkg.id]);
    case 'memory':
      return problem('code-stopped', `${of} was stopped as it loaded: ${PAST_MEMORY}`, [pkg.id]);
    case 'answer':
      return problem('code-failed', `${of} did not load: ${failure.reason}.`, [pkg.id]);
  }
}

/** The package's code is off: its calls stopped too many times in a row. */
export function offProblem(pkg: Named): Problem {
  return problem(
    'code-off',
    `The code of the package ${JSON.stringify(pkg.name)} is off until the project opens again: its calls stopped ${CODE_LIMITS.stopsBeforeOff} times in a row.`,
    [pkg.id],
  );
}

/**
 * The package's code kept the code worker from answering, in work the interpreter could not stop in
 * time, so the worker was stopped and started again; it counts as a call that stopped.
 */
export function stalledProblem(pkg: Named): Problem {
  return problem(
    'code-stopped',
    `The code of the package ${JSON.stringify(pkg.name)} was stopped: it kept the worker that runs package code from answering, so the worker started again.`,
    [pkg.id],
  );
}

/** The package's code waits for the person's approval. */
export function notApprovedProblem(pkg: Named): Problem {
  return problem(
    'code-not-approved',
    `The code of the package ${JSON.stringify(pkg.name)} is not approved: the person approves it in the app before it runs.`,
    [pkg.id],
  );
}

/** The package's code is too large to run. */
export function tooLargeProblem(pkg: Named): Problem {
  return problem(
    'invalid-code',
    `The code of the package ${JSON.stringify(pkg.name)} is over 256 KiB, so it never runs.`,
    [pkg.id],
  );
}

/** A problem the package's `check` found with an element, in the code's own words. */
export function checkedProblem(pkg: Named, element: Named, message: string): Problem {
  return problem('code-check', message, [pkg.id, element.id]);
}

const PAST_TIME = `it ran past ${CODE_LIMITS.callMs} ms.`;
const PAST_MEMORY = `it took more than ${CODE_LIMITS.memoryBytes / 1024 / 1024} MiB.`;

/** An error's message on one line, of at most 300 characters. */
function oneLine(message: string): string {
  const line = message.replace(/\s+/g, ' ').trim();
  return line.length > CODE_LIMITS.problemText
    ? `${line.slice(0, CODE_LIMITS.problemText - 1)}…`
    : line || 'it gave no reason';
}
