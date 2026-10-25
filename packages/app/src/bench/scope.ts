/**
 * The benchmark's phase for scopes (ADR-0040): at 10,000 elements, changes of the view's scope, each
 * timed from the scene's build to the frame drawn with it, as the app shows a change. Three kinds,
 * one after another:
 * - leaving one system out of the view and adding it back, from the shape menu, where its contents
 *   move into World and back: a change of containment, which keeps every other shape and line;
 * - leaving one element out and adding it back, where only it and its relations go;
 * - a rule that shows only the Services, which leaves most of the view out, and taking it away.
 *
 * Expected on the reference laptop: one element in 50 ms or less, like one edit; a system with its
 * contents within 100 ms; and the rule within 150 ms, like a whole layout.
 */
import {
  applyOperations,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** What the phase reports, as the benchmark's timed phases do. */
export interface TimedScope {
  name: string;
  times: number[];
  mark?: number;
  note?: string;
}

/** What the phase needs of the benchmark's page. */
export interface ScopeBench {
  /** The project as the page shows it now. */
  project: () => ProjectSnapshot;
  /** Shows a project as the app does after a change, and says how long each part took. */
  show: (next: ProjectSnapshot) => { build: number; index: number; draw: number };
  settle: (milliseconds: number) => Promise<void>;
  view: Id;
}

/** How long each kind of change of scope may take, at the 95th percentile. */
export const SCOPE_MARKS = { element: 50, system: 100, rule: 150 } as const;

/** Changes the view's scope back and forth, `count` times each way for each kind. */
export async function measureScopeChanges(bench: ScopeBench, count: number): Promise<TimedScope[]> {
  performance.mark('phase Scope changes');
  const start = bench.project();
  const elements = start.model.elements;
  const system = elements.find((element) => element.component === 'systems.system')?.id;
  const service = elements.find((element) => element.component === 'systems.service')?.id;
  const kinds: { name: string; mark: number; away: Command | undefined; back: Command }[] = [
    {
      name: 'Scope: leave one element out of the view, and add it back',
      mark: SCOPE_MARKS.element,
      away:
        service === undefined
          ? undefined
          : { type: 'leave-out-of-view', view: bench.view, elements: [service] },
      back: { type: 'add-to-view', view: bench.view, elements: service ? [service] : [] },
    },
    {
      name: 'Scope: leave a system out of the view, its contents into World, and add it back',
      mark: SCOPE_MARKS.system,
      away:
        system === undefined
          ? undefined
          : { type: 'leave-out-of-view', view: bench.view, elements: [system] },
      back: { type: 'add-to-view', view: bench.view, elements: system ? [system] : [] },
    },
    {
      name: 'Scope: show only the Services, then the whole model',
      mark: SCOPE_MARKS.rule,
      away: {
        type: 'set-scope',
        view: bench.view,
        scope: { include: [{ kind: 'component', component: 'systems.service' }] },
      },
      back: { type: 'set-scope', view: bench.view, scope: null },
    },
  ];
  const results: TimedScope[] = [];
  for (const kind of kinds) {
    const times: number[] = [];
    const parts = { build: 0, index: 0, draw: 0 };
    for (let each = 0; each < count * 2 && kind.away; each++) {
      const command = each % 2 === 0 ? kind.away : kind.back;
      const outcome = executeCommand(bench.project(), command);
      if (!outcome.ok)
        throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
      // As the app applies what the local program sends back.
      const taken = bench.show(applyOperations(bench.project(), outcome.operations).state);
      parts.build += taken.build;
      parts.index += taken.index;
      parts.draw += taken.draw;
      times.push(taken.build + taken.index + taken.draw);
      await bench.settle(50);
    }
    const average = (total: number) => (total / Math.max(1, times.length)).toFixed(0);
    results.push({
      name: kind.name,
      times,
      mark: kind.mark,
      note: `scene ${average(parts.build)} ms, index ${average(parts.index)} ms, tiles and frame ${average(parts.draw)} ms on average`,
    });
  }
  return results;
}
