/**
 * Applying a reader's plan in the tests as the import pipeline does (ADR-0042): the suggested mapping,
 * `planToCommand`, the core's own checks, and one undo that gives the project back exactly.
 */
import type { Id } from '@visual-anything/schema';
import { expect } from 'vitest';
import { SYSTEMS } from '../../builtin/systems';
import { executeCommand } from '../../commands';
import { applyOperations } from '../../operations';
import type { ProjectSnapshot } from '../../snapshot';
import { definitionsIn } from '../../state';
import { sequentialIds, testProject } from '../../test/fixtures';
import { planProblems, planToCommand, type ImportMapping, type ImportPlan } from '../plan';
import type { ImportRead, ReadOptions } from '../reading';

/** The tests' small project, using the built-in Systems package as well. */
export function systemsProject(): ProjectSnapshot {
  const project = testProject();
  return {
    ...project,
    project: { ...project.project, packages: ['test', 'systems'] },
    packages: [...project.packages, SYSTEMS],
  };
}

/** What a reader is told about a project: which definitions it uses. */
export function optionsFor(state: ProjectSnapshot): ReadOptions {
  const definitions = definitionsIn(state);
  return {
    uses: (id) =>
      definitions.components.has(id) ||
      definitions.relationTypes.has(id) ||
      id === 'essence' ||
      id === 'relates-to',
  };
}

/** The plan of a reading that must succeed. */
export function planOf(read: ImportRead): ImportPlan {
  if (!read.ok) throw new Error(`Refused: ${read.problems.join(' ')}`);
  return read.plan;
}

/** Each kind mapped to its suggestion, or to Box and "relates to" when it has none. */
export function suggestedMapping(
  plan: ImportPlan,
  nesting: Id = 'systems.is-part-of',
): ImportMapping {
  return {
    elements: Object.fromEntries(
      plan.kinds.elements.map((kind) => [kind.kind, kind.suggested ?? 'systems.box']),
    ),
    relations: Object.fromEntries(
      plan.kinds.relations.map((kind) => [kind.kind, kind.suggested ?? 'relates-to']),
    ),
    nesting,
  };
}

/**
 * Applies a plan through `planToCommand` and the core, checking that it is one action that one undo
 * takes back exactly, and gives the project after it with the ids planned.
 */
export function applyPlan(
  state: ProjectSnapshot,
  plan: ImportPlan,
  mapping: ImportMapping = suggestedMapping(plan),
): { state: ProjectSnapshot; ids: ReadonlyMap<string, Id> } {
  expect(planProblems(state, plan, mapping)).toEqual([]);
  const planned = planToCommand(state, plan, mapping, sequentialIds());
  if (!planned.ok) throw new Error(planned.problems.join(' '));
  const outcome = executeCommand(state, planned.command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return { state: outcome.state, ids: planned.ids };
}

/** A data URL's bytes, as `?inline` imports give a binary fixture. */
export function bytesOfDataUrl(url: string): Uint8Array {
  const base64 = url.slice(url.indexOf(',') + 1);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    value = (value << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 255);
    }
  }
  return Uint8Array.from(bytes);
}
