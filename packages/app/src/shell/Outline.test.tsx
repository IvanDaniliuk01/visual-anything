import { definitionsOf, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syntheticProject } from '../bench/synthetic';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION, selectionOf, type Selectable, type Selection } from '../editor/selection';
import { loadSample } from '../test/sample';
import { ModelPanel } from './ModelPanel';

const sample = loadSample();

interface HarnessProps {
  project?: ProjectSnapshot;
  onReveal?: (key: string) => void;
  /** What the stand-in for the canvas selects when its button is pressed. */
  canvasSelects?: Selectable[];
}

/** The model panel with the editor's state, as the shell keeps it, and a stand-in for the canvas. */
function Harness({ project = sample, onReveal, canvasSelects = [] }: HarnessProps) {
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const view = project.views[0];
  const scene = useMemo(() => (view ? buildScene(project, view.id) : undefined), [project, view]);
  const definitions = definitionsOf(project.packages);
  const editor: Editor = {
    project,
    definitions,
    viewId: view?.id,
    scene,
    selection,
    select: setSelection,
    send: undefined,
    reveal: (key) => onReveal?.(key),
  };
  return (
    <EditorContext.Provider value={editor}>
      <ModelPanel project={project} definitions={definitions} openViewId={view?.id} />
      <button type="button" onClick={() => setSelection(selectionOf(canvasSelects))}>
        Select on the canvas
      </button>
    </EditorContext.Provider>
  );
}

function outlineTree(): HTMLElement {
  return screen.getByRole('tree', { name: 'Outline of System overview' });
}

/** Each row drawn: what it is called and how deep it sits. */
function rowsOf(tree: HTMLElement): [string, number][] {
  return within(tree)
    .getAllByRole('treeitem')
    .map((row) => [nameOf(row), Number(row.getAttribute('aria-level'))]);
}

function nameOf(row: Element): string {
  return row.getAttribute('aria-label') ?? row.textContent ?? '';
}

function row(name: string, tree: HTMLElement = outlineTree()): HTMLElement {
  return within(tree).getByRole('treeitem', { name });
}

function focused(): Element | null {
  return document.activeElement;
}

/** Presses a key on the row that has the focus. */
function press(key: string): void {
  const target = focused();
  if (!target) throw new Error('Nothing has the focus.');
  fireEvent.keyDown(target, { key });
}

function focus(element: HTMLElement): void {
  act(() => element.focus());
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('The outline', () => {
  it('mirrors the view: World’s shapes at the top, each container’s shapes inside it', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true');
    expect(rowsOf(outlineTree())).toEqual([
      ['Patient, Person', 1],
      ['Clinic booking, System', 1],
      ['WhatsApp channel, Chat channel', 2],
      ['Booking agent, AI agent', 2],
      ['Scheduling, System', 2],
      ['Appointments API, Service', 3],
      ['Appointments DB, Calendar', 3],
      ['Reminder service, Service', 3],
      [
        'Note, Scheduling owns the calendar: only the Appointments API reads and writes the Appointments DB.',
        1,
      ],
    ]);
    const clinic = row('Clinic booking, System');
    expect(clinic).toHaveAttribute('aria-expanded', 'true');
    expect(clinic).toHaveAttribute('aria-posinset', '2');
    expect(clinic).toHaveAttribute('aria-setsize', '3');
    expect(row('Patient, Person')).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the relations on a shape inside its row, each from that shape’s side', () => {
    render(<Harness />);
    focus(row('Booking agent, AI agent'));
    press('ArrowRight');
    const toApi = row('Booking agent communicates with Appointments API, “HTTPS”');
    const fromWhatsApp = row('WhatsApp channel communicates with Booking agent');
    expect(toApi).toHaveTextContent('→ Appointments API, communicates with “HTTPS”');
    expect(fromWhatsApp).toHaveTextContent('← WhatsApp channel, communicates with');
    expect(toApi).toHaveAttribute('aria-level', '3');
    expect(fromWhatsApp).toHaveAttribute('aria-posinset', '2');
  });

  it('gives an element with several containers a row inside each, all selected together', () => {
    render(<Harness project={withSecondContainer(sample)} />);
    const rows = within(outlineTree()).getAllByRole('treeitem', {
      name: 'Reminder service, Service',
    });
    expect(rows.map((each) => each.getAttribute('aria-level'))).toEqual(['3', '2']);
    fireEvent.click(rows[1]!);
    for (const each of rows) expect(each).toHaveAttribute('aria-selected', 'true');
  });

  it('moves between rows with the arrow keys, Home and End', () => {
    render(<Harness />);
    const patient = row('Patient, Person');
    expect(patient).toHaveAttribute('tabindex', '0');
    focus(patient);
    press('ArrowDown');
    expect(focused()).toHaveAccessibleName('Clinic booking, System');
    expect(focused()).toHaveAttribute('tabindex', '0');
    expect(patient).toHaveAttribute('tabindex', '-1');
    press('ArrowRight');
    expect(focused()).toHaveAccessibleName('WhatsApp channel, Chat channel');
    press('ArrowLeft');
    expect(focused()).toHaveAccessibleName('Clinic booking, System');
    press('End');
    expect(focused()).toHaveAccessibleName(/^Note,/);
    press('Home');
    expect(focused()).toHaveAccessibleName('Patient, Person');
    press('ArrowUp');
    expect(focused()).toHaveAccessibleName('Patient, Person');
  });

  it('opens and closes rows with Right and Left', () => {
    render(<Harness />);
    focus(row('Clinic booking, System'));
    press('ArrowLeft');
    expect(row('Clinic booking, System')).toHaveAttribute('aria-expanded', 'false');
    expect(within(outlineTree()).queryByRole('treeitem', { name: /^WhatsApp channel/ })).toBeNull();
    press('ArrowLeft');
    expect(focused()).toHaveAccessibleName('Clinic booking, System');
    press('ArrowRight');
    expect(row('Clinic booking, System')).toHaveAttribute('aria-expanded', 'true');
    expect(focused()).toHaveAccessibleName('Clinic booking, System');
  });

  it('opens and closes a row with a click on its triangle, without selecting it', () => {
    render(<Harness />);
    const clinic = row('Clinic booking, System');
    fireEvent.click(clinic.querySelector('.tree-toggle')!);
    expect(clinic).toHaveAttribute('aria-expanded', 'false');
    expect(clinic).toHaveAttribute('aria-selected', 'false');
  });

  it('goes to a row that starts with the letters typed', () => {
    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    render(<Harness />);
    focus(row('Patient, Person'));
    press('a');
    expect(focused()).toHaveAccessibleName('Appointments API, Service');
    press('a');
    expect(focused()).toHaveAccessibleName('Appointments DB, Calendar');
    now += 1000;
    press('b');
    press('o');
    expect(focused()).toHaveAccessibleName('Booking agent, AI agent');
    now += 1000;
    press('R');
    expect(focused()).toHaveAccessibleName('Reminder service, Service');
  });

  it('selects what a row stands for with Enter or a click, and shows it on the canvas', () => {
    const onReveal = vi.fn();
    render(<Harness onReveal={onReveal} />);
    focus(row('Appointments API, Service'));
    press('Enter');
    expect(row('Appointments API, Service')).toHaveAttribute('aria-selected', 'true');
    expect(onReveal).toHaveBeenLastCalledWith('clinic-booking/scheduling/appointments-api');

    fireEvent.click(row('Patient, Person'));
    expect(row('Patient, Person')).toHaveAttribute('aria-selected', 'true');
    expect(row('Appointments API, Service')).toHaveAttribute('aria-selected', 'false');
    expect(onReveal).toHaveBeenLastCalledWith('patient');
  });

  it('selects a relation from its row, and goes to its far end with Enter again', () => {
    const onReveal = vi.fn();
    render(<Harness onReveal={onReveal} />);
    focus(row('Booking agent, AI agent'));
    press('ArrowRight');
    press('ArrowDown');
    expect(focused()).toHaveAccessibleName(
      'Booking agent communicates with Appointments API, “HTTPS”',
    );
    press('Enter');
    expect(focused()).toHaveAttribute('aria-selected', 'true');
    expect(onReveal).toHaveBeenLastCalledWith('agent-to-api');

    press('Enter');
    expect(focused()).toHaveAccessibleName('Appointments API, Service');
    expect(focused()).toHaveAttribute('aria-selected', 'true');
    expect(onReveal).toHaveBeenLastCalledWith('clinic-booking/scheduling/appointments-api');
  });

  it('marks what the canvas selects, opening the rows around it and keeping the tab stop on it', () => {
    render(<Harness canvasSelects={[{ kind: 'element', id: 'appointments-db' }]} />);
    focus(row('Clinic booking, System'));
    press('ArrowLeft');
    fireEvent.click(screen.getByRole('button', { name: 'Select on the canvas' }));
    const db = row('Appointments DB, Calendar');
    expect(db).toHaveAttribute('aria-selected', 'true');
    expect(db).toHaveAttribute('tabindex', '0');
    expect(row('Clinic booking, System')).toHaveAttribute('aria-expanded', 'true');
    expect(row('Patient, Person')).toHaveAttribute('aria-selected', 'false');
  });

  it('opens the row of the shape a relation the canvas selects sits under', () => {
    render(<Harness canvasSelects={[{ kind: 'relation', id: 'api-reads-db' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select on the canvas' }));
    expect(row('Appointments API, Service')).toHaveAttribute('aria-expanded', 'true');
    expect(row('Appointments API reads from Appointments DB')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('keeps its open and closed rows while the Model tab shows', () => {
    render(<Harness />);
    focus(row('Clinic booking, System'));
    press('ArrowLeft');
    fireEvent.click(screen.getByRole('tab', { name: 'Model' }));
    expect(screen.queryByRole('tree', { name: 'Outline of System overview' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    expect(row('Clinic booking, System')).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('The tabs', () => {
  it('switch with the arrow keys, Home and End, which move the focus with them', () => {
    render(<Harness />);
    const outlineTab = screen.getByRole('tab', { name: 'Outline' });
    focus(outlineTab);
    fireEvent.keyDown(outlineTab, { key: 'ArrowRight' });
    const modelTab = screen.getByRole('tab', { name: 'Model' });
    expect(modelTab).toHaveAttribute('aria-selected', 'true');
    expect(focused()).toBe(modelTab);
    expect(screen.getByRole('tabpanel', { name: 'Model' })).toHaveTextContent('Views');
    fireEvent.keyDown(modelTab, { key: 'Home' });
    expect(outlineTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Outline' })).toContainElement(outlineTree());
  });
});

describe('World’s tree in the Model tab', () => {
  it('follows the model’s containment, and selects an element from its row', () => {
    const onReveal = vi.fn();
    render(<Harness onReveal={onReveal} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Model' }));
    const world = screen.getByRole('tree', { name: 'World' });
    expect(rowsOf(world).slice(0, 4)).toEqual([
      ['Patient, Person', 1],
      ['Clinic booking, System', 1],
      ['WhatsApp channel, Chat channel', 2],
      ['Booking agent, AI agent', 2],
    ]);
    fireEvent.click(row('Appointments DB, Calendar', world));
    expect(row('Appointments DB, Calendar', world)).toHaveAttribute('aria-selected', 'true');
    expect(onReveal).toHaveBeenLastCalledWith('clinic-booking/scheduling/appointments-db');
  });
});

describe('With 10,000 shapes', () => {
  const big = syntheticProject({ elements: 10_000 });

  it('draws only a screenful of rows', { timeout: 30_000 }, () => {
    render(<Harness project={big} />);
    const tree = screen.getByRole('tree', { name: 'Outline of Everything' });
    const drawn = within(tree).getAllByRole('treeitem');
    expect(drawn.length).toBeLessThan(50);
    expect(drawn[0]).toHaveAccessibleName('System 0, System');
    expect(drawn[0]).toHaveAttribute('aria-setsize', '400');

    focus(drawn[0] as HTMLElement);
    press('End');
    expect(focused()).toHaveAccessibleName(/^Element 399\.23,/);
    expect(within(tree).getAllByRole('treeitem').length).toBeLessThan(50);
  });

  it('scrolls to the row of a shape the canvas selects, far down', { timeout: 30_000 }, () => {
    render(<Harness project={big} canvasSelects={[{ kind: 'element', id: 'element-300-7' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select on the canvas' }));
    const tree = screen.getByRole('tree', { name: 'Outline of Everything' });
    const selected = within(tree).getByRole('treeitem', { name: /^Element 300\.7,/ });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    const viewport = tree.parentElement as HTMLElement;
    expect(viewport.scrollTop).toBeGreaterThan(0);
    expect(within(tree).getAllByRole('treeitem').length).toBeLessThan(50);
  });

  it('draws only a screenful of World’s tree too', { timeout: 30_000 }, () => {
    render(<Harness project={big} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Model' }));
    const world = screen.getByRole('tree', { name: 'World' });
    expect(within(world).getAllByRole('treeitem').length).toBeLessThan(50);
  });
});

/** The sample with the Reminder service inside Clinic booking too, so that it has two shapes. */
function withSecondContainer(project: ProjectSnapshot): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      relations: [
        ...project.model.relations,
        {
          id: 'reminders-in-clinic',
          relationType: 'systems.is-part-of',
          from: 'reminder-service',
          to: 'clinic-booking',
        },
      ],
    },
  };
}
