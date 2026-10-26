/**
 * Claude's tools for live values (ADR 0057): values Claude read from its other MCP servers, such as a
 * service's latency now or a queue's depth, shown over the attributes they name while the project is
 * open. The program keeps them in memory only: they are never commands, never saved, never in the
 * history, and the person can keep one as an ordinary attribute from the inspector.
 */
import { LIVE_LIMITS } from '@visual-anything/core';
import { z } from 'zod';
import { counted, fail, id, ok, tool, withoutUndefined } from './kit';
import { idKind } from './queries';
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
        unknown:
          kept.unknown.length > 0
            ? kept.unknown.map((each) => ({
                target: each,
                why:
                  idKind(state, each) === undefined
                    ? 'No element or relation has this id; find_elements and find_relations give the ids.'
                    : `This is the id of ${idKind(state, each)}, which has no live values: give an element or a relation.`,
              }))
            : undefined,
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

export const LIVE_TOOLS: readonly Tool[] = [setLiveValues, clearLiveValues];
