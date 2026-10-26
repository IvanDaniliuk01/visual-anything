/**
 * Claude's tools for live values (ADR 0057): values Claude read from its other MCP servers, such as a
 * service's latency now or a queue's depth, shown over the attributes they name while the project is
 * open. The program keeps them in memory only: they are never commands, never saved, never in the
 * history, and the person can keep one as an ordinary attribute from the inspector. Claude reads them
 * back, everyone's, from the program's store: with get_live_values, and beside the stored attributes
 * of what get_item and find_elements read. Reading them stores nothing.
 */
import {
  LIVE_LIMITS,
  liveAge,
  modelIndexOf,
  type LiveValue,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { z } from 'zod';
import type { Program } from './bridge';
import { READ, counted, fail, id, ok, tool, withoutUndefined } from './kit';
import { DEFAULT_RESULTS, MAX_RESULTS, idKind } from './queries';
import type { Tool, ToolHints } from './tools';

const LIVE: ToolHints = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const NEVER_SAVED =
  'Live values show over the attribute they name, in the detail of shapes, in overlays, in filters and in the inspector, each with a live mark and its age; they are never saved, never in the history, and go when Visual Anything stops. The person can keep one as an ordinary attribute from the inspector.';

const setLiveValues = tool({
  name: 'set_live_values',
  title: 'Show live values',
  description: `Shows values that come from outside, such as what your other MCP servers report now, over the attributes they name: a service's latency, a queue's depth, a neuron population's firing rate. Each value is the latest of its target (an element or a relation) and attribute until another replaces it. ${NEVER_SAVED} Use it for numbers that change; to change what the model says for good, use update-element or update-relation instead.

A value is a string, a number, a boolean or JSON of at most 1 KiB written as JSON. measuredAt, when you know it, says when it was measured: an ISO 8601 date-time or milliseconds since 1970; the age counts from it. freshFor is how many seconds the values stay fresh, 60 by default: past it they fade and say how old they are. At most ${LIVE_LIMITS.valuesPerMessage} values a call; calls past twenty a second wait, and past that the oldest values are dropped.

Example: { "values": [{ "target": "api", "attribute": "latency", "value": 120 }, { "target": "queue", "attribute": "depth", "value": 42, "measuredAt": "2026-10-25T14:03:00Z" }] }
Example: { "values": [{ "target": "api-reads-db", "attribute": "calls per second", "value": 310 }], "freshFor": 15 }`,
  input: {
    values: z
      .array(
        z.object({
          target: id().describe('The element or relation the value is of.'),
          attribute: z.string().min(1).max(LIVE_LIMITS.attributeName),
          value: z
            .unknown()
            .describe('A string, number, boolean or JSON of at most 1 KiB written as JSON.'),
          measuredAt: z
            .union([z.string().max(64), z.number()])
            .optional()
            .describe(
              'When it was measured: an ISO 8601 date-time, such as "2026-10-25T14:03:00Z", or milliseconds since 1970.',
            ),
        }),
      )
      .min(1)
      .max(LIVE_LIMITS.valuesPerMessage),
    freshFor: z
      .number()
      .min(LIVE_LIMITS.freshForMin / 1000)
      .max(LIVE_LIMITS.freshForMax / 1000)
      .optional()
      .describe('How many seconds the values stay fresh; 60 by default.'),
  },
  hints: LIVE,
  run: async (args, program) => {
    if (program.setLive === undefined) return fail('This Visual Anything cannot take live values.');
    const values: unknown[] = [];
    for (const [at, each] of args.values.entries()) {
      const measuredAt = timeOf(each.measuredAt);
      if (measuredAt === 'invalid') {
        return fail(
          `Value ${at + 1} has a measuredAt that is neither an ISO 8601 date-time nor milliseconds since 1970: ${JSON.stringify(each.measuredAt)}.`,
        );
      }
      values.push({
        target: each.target,
        attribute: each.attribute,
        value: each.value,
        ...(measuredAt === undefined ? {} : { measuredAt }),
      });
    }
    const kept = await program.setLive(values, {
      ...(args.freshFor === undefined ? {} : { freshFor: Math.round(args.freshFor * 1000) }),
      from: 'claude',
    });
    const state = await program.project();
    return ok(
      withoutUndefined({
        kept: counted(kept.kept, 'live value'),
        waiting:
          kept.waiting > 0
            ? `${counted(kept.waiting, 'value')} wait for their turn: calls past twenty a second are taken a second later.`
            : undefined,
        dropped:
          kept.dropped > 0
            ? `${counted(kept.dropped, 'older value')} dropped: past ${LIVE_LIMITS.valuesPerMessage} in a call, or waiting past that.`
            : undefined,
        unknown: kept.unknown.length > 0 ? unknownTargets(state, kept.unknown) : undefined,
        refused:
          kept.refused.length > 0
            ? kept.refused.map((each) => `Value ${each.at + 1} ${each.reason}.`)
            : undefined,
        note: NEVER_SAVED,
      }),
    );
  },
});

const clearLiveValues = tool({
  name: 'clear_live_values',
  title: 'Clear live values',
  description: `Takes away live values that set_live_values showed, so that the attributes read as stored again: of some targets, of some attributes, or all of them. By default it clears only yours; with everyone it also clears those a script sent with visual-anything live and those package code made. Nothing is saved or enters the history either way.

Example: { "targets": ["api"] }
Example: { "attributes": ["latency"], "everyone": true }
Example: {}`,
  input: {
    targets: z.array(id()).min(1).max(LIVE_LIMITS.valuesPerMessage).optional(),
    attributes: z
      .array(z.string().min(1).max(LIVE_LIMITS.attributeName))
      .min(1)
      .max(LIVE_LIMITS.valuesPerMessage)
      .optional(),
    everyone: z
      .boolean()
      .optional()
      .describe('Also clear the live values others sent, not only yours. Default false.'),
  },
  hints: LIVE,
  run: async (args, program) => {
    if (program.clearLive === undefined)
      return fail('This Visual Anything cannot clear live values.');
    const cleared = await program.clearLive({
      ...(args.targets === undefined ? {} : { targets: args.targets }),
      ...(args.attributes === undefined ? {} : { attributes: args.attributes }),
      from: args.everyone === true ? 'everyone' : 'claude',
    });
    return ok({
      cleared: counted(cleared, 'live value'),
      note: 'The attributes read as stored again where no other live value is over them.',
    });
  },
});

/** What the read tools that show attributes say of the live values they show beside them. */
export const LIVE_VALUES_BESIDE =
  'liveValues, right after the stored attributes, are the live values shown over them now, which come from outside and are never saved: each with its sender, its age in seconds and whether it is stale; get_live_values lists them all.';

const READ_NOTE =
  'Live values show over the attribute they name, in place of its stored value, with a live mark and their age; a stale one is marked ○. They are never saved, never in the history, and go when Visual Anything stops.';

const getLiveValues = tool({
  name: 'get_live_values',
  title: 'Read live values',
  description: `Lists the live values shown now over the attributes they name, everyone's: those you sent with set_live_values (sender "claude"), those a script sends with visual-anything live ("command-line"), and those approved package code made from what it fetched ("package", with its package). Each comes with its target, the attribute's stored value when the target has one, its age in seconds (from when it was measured, when its sender said so), and whether it is stale: older than its sender said it stays fresh. The latest come first, ${DEFAULT_RESULTS} by default and at most ${MAX_RESULTS}; past that, a summary counts every one that matches by attribute. Narrow it by targets or attributes. get_item and find_elements show the live values of what they read too. Reading them saves nothing, and they are the person's data, as attribute values are.

Example: {}
Example: { "targets": ["api"] }
Example: { "attributes": ["latency"], "limit": 20 }`,
  input: {
    targets: z
      .array(id())
      .min(1)
      .max(LIVE_LIMITS.valuesPerMessage)
      .optional()
      .describe('Only the live values of these elements and relations.'),
    attributes: z
      .array(z.string().min(1).max(LIVE_LIMITS.attributeName))
      .min(1)
      .max(LIVE_LIMITS.valuesPerMessage)
      .optional()
      .describe('Only the live values of these attributes.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULTS)
      .optional()
      .describe(`At most this many, the latest first; ${DEFAULT_RESULTS} by default.`),
  },
  hints: READ,
  run: async (args, program) => {
    if (program.listLive === undefined)
      return fail('This Visual Anything cannot read live values.');
    const state = await program.project();
    const index = modelIndexOf(state);
    const isTarget = (target: Id) =>
      index.element(target) !== undefined || index.relation(target) !== undefined;
    // Only targets the model has are asked for; the others are named back.
    const unknown = (args.targets ?? []).filter((target) => !isTarget(target));
    const listing = await program.listLive({
      ...(args.targets === undefined ? {} : { targets: args.targets.filter(isTarget) }),
      ...(args.attributes === undefined ? {} : { attributes: args.attributes }),
      limit: args.limit ?? DEFAULT_RESULTS,
    });
    const filtered = args.targets !== undefined || args.attributes !== undefined;
    return ok(
      withoutUndefined({
        values: listing.values.map((value) => {
          const target = index.element(value.target) ?? index.relation(value.target);
          const own = target?.attributes;
          return {
            target: value.target,
            ...(target === undefined
              ? {}
              : { name: targetName(state, value.target), kind: kindOf(state, value.target) }),
            attribute: value.attribute,
            ...describeLive(value, listing.at),
            ...(own !== undefined && Object.hasOwn(own, value.attribute)
              ? { stored: own[value.attribute] }
              : {}),
          };
        }),
        total: listing.total,
        more:
          listing.total > listing.values.length ? listing.total - listing.values.length : undefined,
        summary: listing.summary,
        unknown: unknown.length > 0 ? unknownTargets(state, unknown) : undefined,
        note:
          listing.total > 0
            ? READ_NOTE
            : filtered
              ? 'None of the live values shown now match.'
              : 'No live values show now. set_live_values shows some; a script sends them with visual-anything live, and approved package code from what it fetches.',
      }),
    );
  },
});

/** A live value as Claude's read tools show it: its value, who sent it, how old it is and whether stale. */
export function describeLive(value: LiveValue, at: number) {
  const { age, stale } = liveAge(value, at);
  return {
    value: value.value,
    sender: value.sender.kind,
    ...(value.sender.kind === 'package' ? { package: value.sender.package } : {}),
    ageSeconds: Math.floor(age / 1000),
    stale,
    freshForSeconds: value.freshFor / 1000,
    ...(value.measuredAt === undefined
      ? {}
      : { measuredAt: new Date(value.measuredAt).toISOString() }),
  };
}

/** The live values of some targets, as the read tools show them beside the stored attributes. */
export interface LiveBeside {
  /** By target, each live value by its attribute, in the order of the attributes' names. */
  of: Map<Id, Record<string, ReturnType<typeof describeLive>>>;
  /** What to say when more live values are over these targets than one answer holds. */
  cut?: string;
}

/**
 * The live values over some targets now, read from the program's store (ADR 0057); none where the
 * program cannot say. Reading them changes nothing.
 */
export async function liveBeside(program: Program, targets: readonly Id[]): Promise<LiveBeside> {
  const of: LiveBeside['of'] = new Map();
  if (program.listLive === undefined || targets.length === 0) return { of };
  const listing = await program.listLive({ targets: [...targets] });
  const byTarget = new Map<Id, LiveValue[]>();
  for (const value of listing.values) {
    const list = byTarget.get(value.target) ?? [];
    list.push(value);
    byTarget.set(value.target, list);
  }
  for (const [target, values] of byTarget) {
    values.sort((a, b) => (a.attribute < b.attribute ? -1 : a.attribute > b.attribute ? 1 : 0));
    of.set(
      target,
      Object.fromEntries(values.map((value) => [value.attribute, describeLive(value, listing.at)])),
    );
  }
  return listing.total > listing.values.length
    ? {
        of,
        cut: `liveValues show the latest ${listing.values.length} of the ${listing.total} live values over these; get_live_values with their ids and attributes reads the others.`,
      }
    : { of };
}

/**
 * An element or a relation as a read tool answers it, with its live values, when it has any, right
 * after its stored attributes, so that each reads beside the other.
 */
export function besideAttributes<T extends object>(
  item: T,
  live: Record<string, unknown> | undefined,
): T {
  if (live === undefined) return item;
  const entries = Object.entries(item);
  const at = entries.findIndex(([key]) => key === 'attributes');
  entries.splice(at < 0 ? entries.length : at + 1, 0, ['liveValues', live]);
  return Object.fromEntries(entries) as T;
}

/** Why each of some ids has no live values: nothing has it, or it is neither element nor relation. */
function unknownTargets(state: ProjectSnapshot, ids: readonly Id[]) {
  return ids.map((each) => ({
    target: each,
    why:
      idKind(state, each) === undefined
        ? 'No element or relation has this id; find_elements and find_relations give the ids.'
        : `This is the id of ${idKind(state, each)}, which has no live values: give an element or a relation.`,
  }));
}

function kindOf(state: ProjectSnapshot, target: Id): 'element' | 'relation' | undefined {
  const kind = idKind(state, target);
  return kind === 'element' || kind === 'relation' ? kind : undefined;
}

/** An element's name, or a relation's, or its ends' names when it has none. */
function targetName(state: ProjectSnapshot, target: Id): string {
  const index = modelIndexOf(state);
  const element = index.element(target);
  if (element) return element.name;
  const relation = index.relation(target);
  if (!relation) return target;
  if (relation.name !== undefined) return relation.name;
  const end = (id: Id) => index.element(id)?.name ?? index.relation(id)?.name ?? id;
  return `${end(relation.from)} → ${end(relation.to)}`;
}

/** A time given as an ISO 8601 date-time or milliseconds since 1970, in milliseconds. */
function timeOf(value: string | number | undefined): number | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= LIVE_LIMITS.latestTime
      ? value
      : 'invalid';
  }
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(value)) {
    return 'invalid';
  }
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= 0 ? time : 'invalid';
}

export const LIVE_TOOLS: readonly Tool[] = [getLiveValues, setLiveValues, clearLiveValues];
