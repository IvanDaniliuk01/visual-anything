/**
 * The import dialog's own work on the main thread (ADR-0042), timed apart from the canvas: reading a
 * file into a plan with the suggestions, and preparing the one batch, which the dialog does again on
 * each change of the mapping. The batch is not sent, so the program's work is not timed here: a batch
 * of N creates takes the core's commands time that grows faster than N, which the report says.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { prepare, readInput, suggestedChoices } from '../import/importing';
import type { Step, StepPhase } from './app';

/** A flowchart of `nodes` nodes in subgraphs of ten, each node joined to the next. */
function flowchart(nodes: number): string {
  const lines = ['flowchart LR'];
  for (let at = 0; at < nodes; at++) {
    if (at % 10 === 0) lines.push(`  subgraph g${at / 10} [Group ${at / 10}]`);
    lines.push(`  n${at}[Node ${at}]${at % 3 === 0 ? ':::service' : ''}`);
    if (at % 10 === 9 || at === nodes - 1) lines.push('  end');
  }
  for (let at = 1; at < nodes; at++) lines.push(`  n${at - 1} --> n${at}`);
  return lines.join('\n');
}

/** A spreadsheet of `rows` elements, then as many relations. */
function spreadsheet(rows: number): string {
  const elements = ['id,name,component,owner'];
  for (let at = 0; at < rows; at++) elements.push(`r${at},Row ${at},Service,Team ${at % 7}`);
  const relations = ['from,to,relation type'];
  for (let at = 1; at < rows; at++) relations.push(`r${at - 1},r${at},calls`);
  return `${elements.join('\n')}\n\n${relations.join('\n')}`;
}

function timed(run: () => void): Step {
  const start = performance.now();
  run();
  const total = performance.now() - start;
  return {
    total,
    listeners: total,
    shown: total,
    work: total,
    core: total,
    rendering: 0,
    commits: 0,
    layoutEffects: 0,
    passiveEffects: 0,
  };
}

/**
 * Reading and preparing imports of growing size into the benchmark's project, `times` times each:
 * a 1,000- and a 10,000-node flowchart, and a 10,000-row spreadsheet. Expected on the reference
 * laptop: well under a second each for reading, and as long again for each change of the mapping.
 */
export function importPhases(project: ProjectSnapshot, times: number): StepPhase[] {
  const inputs = [
    { name: 'Import: read a 1,000-node flowchart', file: 'small.mmd', text: flowchart(1_000) },
    { name: 'Import: read a 10,000-node flowchart', file: 'large.mmd', text: flowchart(10_000) },
    { name: 'Import: read a 10,000-row spreadsheet', file: 'large.csv', text: spreadsheet(10_000) },
  ];
  const phases: StepPhase[] = [];
  for (const { name, file, text } of inputs) {
    const reads: Step[] = [];
    const prepares: Step[] = [];
    for (let each = 0; each < times; each++) {
      let reading: ReturnType<typeof readInput> | undefined;
      reads.push(
        timed(() => {
          reading = readInput(project, { name: file, text });
        }),
      );
      const read = reading;
      if (read === undefined || !read.ok) throw new Error(`${file} could not be read.`);
      const choices = suggestedChoices(project, read.reading.plan, project.views[0]?.id);
      prepares.push(timed(() => void prepare(project, read.reading.plan, choices)));
    }
    phases.push({
      name,
      mark: { text: 'worst ≤ 1,000', passes: ({ worst }) => worst <= 1_000 },
      steps: reads,
    });
    phases.push({
      name: `${name.replace('read', 'prepare')}`,
      mark: { text: 'worst ≤ 1,000', passes: ({ worst }) => worst <= 1_000 },
      steps: prepares,
    });
  }
  return phases;
}
