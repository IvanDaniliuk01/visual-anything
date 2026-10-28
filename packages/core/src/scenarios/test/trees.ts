/**
 * Scenarios with decisions for property tests (ADR 0078): a structure as a tree, from which `written`
 * makes the flat steps and the blocks, and against which `reference` reads what plays.
 */
import type { DecisionBlock, DecisionChoices, ScenarioFile, Step } from '@visual-anything/schema';
import fc from 'fast-check';

export type Segment =
  | { kind: 'steps'; count: number }
  | {
      kind: 'decision';
      alternatives: { segments: Segment[]; ends: boolean }[];
      byDefault?: number;
    };

const steps = (count: number): fc.Arbitrary<Segment> =>
  fc.constant({ kind: 'steps' as const, count });

function segmentOf(depth: number, anyEnds = false): fc.Arbitrary<Segment> {
  const plain = fc.integer({ min: 1, max: 3 }).chain(steps);
  if (depth >= 3) return plain;
  const decision = fc
    .record({
      alternatives: fc.array(
        fc.record({
          segments: fc.array(segmentOf(depth + 1, anyEnds), { maxLength: 2 }),
          ends: fc.boolean(),
        }),
        { minLength: 2, maxLength: 4 },
      ),
      byDefault: fc.option(fc.nat({ max: 3 }), { nil: undefined }),
    })
    .map(({ alternatives, byDefault }): Segment => {
      // At least one alternative has steps, and one does not end, so that every step can be reached.
      const fixed = alternatives.map((each, at) => ({
        segments:
          at === 0 && each.segments.length === 0
            ? [{ kind: 'steps' as const, count: 1 }]
            : each.segments,
        ends: at === 0 && !anyEnds ? false : each.ends,
      }));
      return {
        kind: 'decision',
        alternatives: fixed,
        ...(byDefault === undefined ? {} : { byDefault: byDefault % fixed.length }),
      };
    });
  return fc.oneof({ weight: 2, arbitrary: plain }, { weight: 1, arbitrary: decision });
}

/** A scenario's structure: one to five segments, decisions at most three deep. */
export const tree = fc.array(segmentOf(1), { minLength: 1, maxLength: 5 });

/** As `tree`, but any alternative may end, all of a decision's alternatives included. */
export const anyTree = fc.array(segmentOf(1, true), { minLength: 1, maxLength: 5 });

export interface Written {
  scenario: ScenarioFile;
  tree: Segment[];
}

/** Writes a tree as a scenario: its steps in reading order, and a block for each decision. */
export function written(tree: Segment[]): Written {
  const all: Step[] = [];
  const blocks: DecisionBlock[] = [];
  let counter = 0;
  const write = (segments: Segment[]): string[] => {
    const ids: string[] = [];
    for (const segment of segments) {
      if (segment.kind === 'steps') {
        for (let at = 0; at < segment.count; at++) {
          const id = `s${++counter}`;
          all.push({ id, description: id, relations: ['agent-to-api'] });
          ids.push(id);
        }
        continue;
      }
      const decision = `d${++counter}`;
      const block: DecisionBlock = {
        id: decision,
        kind: 'decision',
        question: `Which way at ${decision}?`,
        alternatives: [],
      };
      blocks.push(block);
      segment.alternatives.forEach((alternative, at) => {
        const inner = write(alternative.segments);
        block.alternatives.push({
          id: `${decision}-a${at}`,
          label: `Way ${at}`,
          steps: inner,
          ...(alternative.ends ? { ends: true as const } : {}),
        });
        ids.push(...inner);
      });
      if (segment.byDefault !== undefined) {
        block.default = block.alternatives[segment.byDefault]?.id;
      }
    }
    return ids;
  };
  write(tree);
  return {
    scenario: {
      id: 'scenario',
      name: 'Scenario',
      view: 'system-overview',
      steps: all,
      ...(blocks.length > 0 ? { blocks } : {}),
    },
    tree,
  };
}

/**
 * What a tree plays with these choices, read straight from the tree: the reference. `entered` gets
 * the id of each decision playback reaches, in order.
 */
export function reference(
  tree: Segment[],
  choices: DecisionChoices,
  entered?: (decision: string) => void,
): string[] {
  let counter = 0;
  const played: string[] = [];
  let ended = false;
  const walk = (segments: Segment[], playing: boolean): void => {
    for (const segment of segments) {
      if (segment.kind === 'steps') {
        for (let at = 0; at < segment.count; at++) {
          const id = `s${++counter}`;
          if (playing && !ended) played.push(id);
        }
        continue;
      }
      const decision = `d${++counter}`;
      if (playing && !ended) entered?.(decision);
      const asked = choices[decision];
      const index = segment.alternatives.findIndex((_, at) => `${decision}-a${at}` === asked);
      const chosen = index >= 0 ? index : (segment.byDefault ?? 0);
      segment.alternatives.forEach((alternative, at) => {
        const plays = playing && !ended && at === chosen;
        walk(alternative.segments, plays);
        if (plays && alternative.ends) ended = true;
      });
    }
  };
  walk(tree, true);
  return played;
}

/** Choices from picks: the n-th pick chooses at the n-th decision, wrapping around its alternatives. */
export function choicesFrom(scenario: ScenarioFile, picks: readonly number[]): DecisionChoices {
  const choices: DecisionChoices = {};
  (scenario.blocks ?? []).forEach((block, at) => {
    const pick = picks[at];
    if (pick !== undefined) {
      const alternative = block.alternatives[pick % block.alternatives.length];
      if (alternative) choices[block.id] = alternative.id;
    }
  });
  return choices;
}
