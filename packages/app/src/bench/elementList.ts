/**
 * The benchmark's phases for the element list and destinations (R42, ADR 0056), at 10,000 elements:
 * - working out what the list lists and its columns, as opening it does;
 * - sorting it by the name, and by an attribute;
 * - filtering it by a word;
 * - pasting a block of 100 rows and 2 columns, as one batch, timed from the command to the frame
 *   drawn with it, as the app shows a change;
 * - giving 1,000 elements a destination and taking it away again, each time to the frame drawn with
 *   their marks.
 *
 * Expected on the reference laptop: the list, a sort and a filter within 50 ms each, as one edit is,
 * since the panel draws only the rows in sight; a paste and the marks within 150 ms, as a layout is.
 */
import {
  applyOperations,
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { pasteCommand } from '../element-list/edit';
import {
  columnsOf,
  filterElements,
  listedElements,
  sortElements,
  type Column,
} from '../element-list/rows';
import { translatorFor } from '../i18n/t';

/** What a phase reports, as the benchmark's timed phases do. */
export interface TimedList {
  name: string;
  times: number[];
  mark?: number;
  note?: string;
}

/** What the phases need of the benchmark's page. */
export interface ListBench {
  project: () => ProjectSnapshot;
  show: (next: ProjectSnapshot) => { build: number; index: number; draw: number };
  settle: (milliseconds: number) => Promise<void>;
  view: Id;
}

/** How long each may take, at the 95th percentile. */
export const LIST_MARKS = { list: 50, sort: 50, filter: 50, paste: 150, marks: 150 } as const;

function timedOnce(work: () => void): number {
  const start = performance.now();
  work();
  return performance.now() - start;
}

/** Applies a command as the app applies what the local program sends back, and times the frame. */
function shown(bench: ListBench, command: Command): number {
  const outcome = executeCommand(bench.project(), command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  const taken = bench.show(applyOperations(bench.project(), outcome.operations).state);
  return taken.build + taken.index + taken.draw;
}

export async function measureElementList(bench: ListBench, count: number): Promise<TimedList[]> {
  performance.mark('phase Element list');
  const t = translatorFor('en');
  const start = bench.project();
  const definitions = definitionsIn(start);
  const source = { kind: 'view' } as const;
  let columns: Column[] = [];
  const list: number[] = [];
  const sorts: number[] = [];
  const filters: number[] = [];
  for (let each = 0; each < count; each++) {
    list.push(
      timedOnce(() => {
        columns = columnsOf(definitions, listedElements(start, definitions, bench.view, source));
      }),
    );
    const rows = listedElements(start, definitions, bench.view, source);
    const attribute = columns.find((column) => column.kind === 'attribute') ?? columns[0];
    sorts.push(
      timedOnce(() => {
        sortElements(rows, columns[0] as Column, 'descending', definitions);
        if (attribute) sortElements(rows, attribute, 'ascending', definitions);
      }) / 2,
    );
    filters.push(
      timedOnce(() => {
        filterElements(t, start, rows, columns, 'service 99', undefined, definitions);
      }),
    );
    await bench.settle(20);
  }

  // A pasted block of names, and back.
  const named = new Map(start.model.elements.map((element) => [element.id, element.name]));
  const pastes: number[] = [];
  for (let each = 0; each < count * 2; each++) {
    const rows = listedElements(bench.project(), definitions, bench.view, source);
    const cells = rows
      .slice(0, 100)
      .map((element, at) => [
        each % 2 === 0 ? `Pasted ${at}` : (named.get(element.id) ?? element.name),
        '',
      ]);
    const pasted = pasteCommand(
      rows,
      [columns[0] as Column, { kind: 'id', scheme: 'bench' }],
      {
        row: 0,
        column: 0,
      },
      cells,
    );
    if (pasted.command === undefined) break;
    pastes.push(shown(bench, pasted.command));
    await bench.settle(50);
  }

  // A destination on 1,000 elements, drawn as their marks, and taken away.
  const marks: number[] = [];
  const marked = bench
    .project()
    .model.elements.slice(0, 1_000)
    .map((element) => element.id);
  for (let each = 0; each < count * 2; each++) {
    const away = each % 2 === 1;
    marks.push(
      shown(bench, {
        type: 'batch',
        label: away ? 'Take the destinations away' : 'Give destinations',
        commands: marked.map((id) => ({
          type: 'update-element' as const,
          id,
          changes: away
            ? { removeAttributes: ['benchDocs'] }
            : { attributes: { benchDocs: { url: `https://docs.example.org/${id}` } } },
        })),
      }),
    );
    await bench.settle(50);
  }

  const rows = start.model.elements.length;
  return [
    { name: `Element list: ${rows} rows and their columns`, times: list, mark: LIST_MARKS.list },
    { name: 'Element list: sort by a column', times: sorts, mark: LIST_MARKS.sort },
    { name: 'Element list: filter by words', times: filters, mark: LIST_MARKS.filter },
    {
      name: 'Element list: paste 100 rows of 2 cells, to the frame',
      times: pastes,
      mark: LIST_MARKS.paste,
    },
    {
      name: 'Destinations: 1,000 shapes marked, and unmarked, to the frame',
      times: marks,
      mark: LIST_MARKS.marks,
    },
  ];
}
