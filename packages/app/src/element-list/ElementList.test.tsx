/**
 * The element list (R42): it lists what the open view shows or a component's elements, with their
 * attributes and identifiers as columns; its rows follow the canvas's selection and select on it;
 * the keys move through its cells and edit them in place, each edit one command; a pasted block is
 * one batch; and it sorts and filters. Each command runs here through the core, as the local program
 * would run it.
 */
import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { buildScene } from '../canvas/scene';
import type { Follower } from '../destinations/follower';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { loadSample } from '../test/sample';
import { ElementList } from './ElementList';

function linkedSample(): ProjectSnapshot {
  const outcome = executeCommand(loadSample(), {
    type: 'batch',
    label: 'Set up',
    commands: [
      {
        type: 'update-element',
        id: 'appointments-db',
        changes: { ids: { wikidata: 'Q8513' }, attributes: { sizeGb: 20 } },
      },
      {
        type: 'update-element',
        id: 'appointments-api',
        changes: { attributes: { sizeGb: 3, docs: { url: 'https://docs.example.org' } } },
      },
    ],
  });
  if (!outcome.ok) throw new Error('The sample takes the set up.');
  return outcome.state;
}

interface Run {
  sent: Command[];
  selected: Selection[];
  revealed: string[];
  follow: ReturnType<typeof vi.fn<Follower['follow']>>;
  /** Selects as the canvas would, once the list is drawn. */
  select: (selection: Selection) => void;
}

/** What a test does to the harness from outside: select, as the canvas does. */
interface Handle {
  select: (selection: Selection) => void;
}

function Harness({ run, initial, ref }: { run: Run; initial: ProjectSnapshot; ref: Ref<Handle> }) {
  const [project, setProject] = useState(initial);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  useImperativeHandle(ref, () => ({ select: setSelection }), []);
  const latest = useRef(initial);
  const definitions = useMemo(() => definitionsIn(project), [project]);
  const view = project.views[0];
  const scene = useMemo(() => (view ? buildScene(project, view.id) : undefined), [project, view]);
  const send: SendCommand = (command) => {
    run.sent.push(command);
    const outcome = executeCommand(latest.current, command);
    if (!outcome.ok) return Promise.resolve({ ok: false });
    latest.current = outcome.state;
    setProject(outcome.state);
    return Promise.resolve({ ok: true });
  };
  const editor: Editor = {
    project,
    definitions,
    viewId: view?.id,
    scene,
    selection,
    select: (next) => {
      run.selected.push(next);
      setSelection(next);
    },
    send,
    reveal: (key) => run.revealed.push(key),
    follow: { follow: run.follow },
  };
  return (
    <EditorContext.Provider value={editor}>
      <ElementList onClose={() => {}} />
    </EditorContext.Provider>
  );
}

function renderList() {
  const handle = createRef<Handle>();
  const run: Run = {
    sent: [],
    selected: [],
    revealed: [],
    follow: vi.fn<Follower['follow']>(),
    select: (next) => act(() => handle.current?.select(next)),
  };
  render(<Harness run={run} initial={linkedSample()} ref={handle} />);
  const grid = screen.getByRole('grid', { name: 'Element list' });
  return { run, grid };
}

/** The names the rows show, in their order. */
function names(grid: HTMLElement): string[] {
  return within(grid)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('gridcell')[0]?.textContent ?? '');
}

const answers = () =>
  act(async () => {
    await Promise.resolve();
  });

describe('the element list', () => {
  it('lists what the open view shows, with attributes and identifiers as columns', () => {
    const { grid } = renderList();
    const headers = within(grid)
      .getAllByRole('columnheader')
      .map((each) => each.textContent);
    expect(headers.slice(0, 2)).toEqual(['Name', 'Component']);
    expect(headers).toContain('sizeGb');
    expect(headers.at(-1)).toBe('wikidataidentifier');
    expect(names(grid)).toContain('Appointments DB');
    expect(screen.getByText(/of \d+ elements$/)).toBeTruthy();
  });

  it('selects the element of a pressed row, on the canvas too, and marks what the canvas selects', () => {
    const { run, grid } = renderList();
    const row = within(grid).getByRole('row', { name: /Appointments DB/ });
    fireEvent.click(within(row).getAllByRole('gridcell')[0] as HTMLElement);
    expect([...(run.selected.at(-1)?.elements ?? [])]).toEqual(['appointments-db']);
    expect(run.revealed.at(-1)).toMatch(/appointments-db$/);
    expect(row.getAttribute('aria-selected')).toBe('true');
    run.select(selectionOf([{ kind: 'element', id: 'patient' }]));
    expect(
      within(grid)
        .getByRole('row', { name: /^Patient / })
        .getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('moves through the cells with the keys, and edits one in place as one command', async () => {
    const { run, grid } = renderList();
    const cells = within(grid).getAllByRole('gridcell');
    const first = cells[0] as HTMLElement;
    expect(first.tabIndex).toBe(0);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    const second = document.activeElement as HTMLElement;
    expect(second.getAttribute('aria-colindex')).toBe('1');
    expect(second).not.toBe(first);
    fireEvent.keyDown(second, { key: 'Enter' });
    const input = within(grid).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Renamed in the list' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await answers();
    expect(run.sent.at(-1)).toMatchObject({
      type: 'update-element',
      changes: { name: 'Renamed in the list' },
    });
    expect(names(grid)).toContain('Renamed in the list');
  });

  it('says why a cell cannot take what was typed, and sends nothing', async () => {
    const { run, grid } = renderList();
    const header = within(grid).getAllByRole('columnheader');
    const size = header.findIndex((each) => each.textContent === 'sizeGb');
    const row = within(grid).getByRole('row', { name: /Appointments DB/ });
    const cell = within(row).getAllByRole('gridcell')[size] as HTMLElement;
    fireEvent.doubleClick(cell);
    const input = within(grid).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'big' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await answers();
    expect(screen.getByRole('alert').textContent).toBe('Enter a number.');
    expect(run.sent).toEqual([]);
  });

  it('pastes a block of cells as one batch', async () => {
    const { run, grid } = renderList();
    const first = within(grid).getAllByRole('gridcell')[0] as HTMLElement;
    first.focus();
    fireEvent.paste(grid, {
      clipboardData: { getData: () => 'First\nSecond\nThird\n' },
    });
    await answers();
    expect(run.sent).toHaveLength(1);
    const batch = run.sent[0] as Extract<Command, { type: 'batch' }>;
    expect(batch).toMatchObject({ type: 'batch', label: 'Paste 3 cells into the element list' });
    expect(batch.commands).toHaveLength(3);
    expect(names(grid).slice(0, 3)).toEqual(['First', 'Second', 'Third']);
  });

  it('sorts by a column, both ways and back, and filters by words', () => {
    const { grid } = renderList();
    const before = names(grid);
    const size = within(grid).getByRole('button', { name: 'sizeGb' });
    fireEvent.click(size);
    expect(names(grid).slice(0, 2)).toEqual(['Appointments API', 'Appointments DB']);
    expect(size.parentElement?.getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(size);
    expect(names(grid).slice(0, 2)).toEqual(['Appointments DB', 'Appointments API']);
    fireEvent.click(size);
    expect(names(grid)).toEqual(before);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter' }), {
      target: { value: 'q8513' },
    });
    expect(names(grid)).toEqual(['Appointments DB']);
  });

  it('lists a component’s elements', () => {
    renderList();
    fireEvent.change(screen.getByRole('combobox', { name: 'List' }), {
      target: { value: 'component systems.person' },
    });
    const grid = screen.getByRole('grid', { name: 'Element list' });
    expect(names(grid)).toEqual(['Patient']);
  });

  it('follows a destination in a cell with Alt+Enter', () => {
    const { run, grid } = renderList();
    const header = within(grid).getAllByRole('columnheader');
    const docs = header.findIndex((each) => each.textContent === 'docs');
    const row = within(grid).getByRole('row', { name: /Appointments API/ });
    const cell = within(row).getAllByRole('gridcell')[docs] as HTMLElement;
    expect(cell.textContent).toBe('a page of docs.example.org');
    fireEvent.click(cell);
    fireEvent.keyDown(cell, { key: 'Enter', altKey: true });
    expect(run.follow).toHaveBeenCalledWith({ url: 'https://docs.example.org' });
  });
});
