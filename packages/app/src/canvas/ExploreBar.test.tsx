import { definitionsOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EmphasisStore } from '../editor/emphasis';
import { EMPTY_SELECTION, selectionOf, type Selection } from '../editor/selection';
import { loadSample } from '../test/sample';
import { CanvasToolbar } from './CanvasToolbar';
import { hiddenIn } from './navigation';
import { buildScene, type Scene } from './scene';
import { useExplorer } from './useExplorer';

const sample = loadSample();

const SECURITY: ViewFile = {
  id: 'security',
  name: 'Security',
  perspective: { name: 'Security', description: 'Who may reach what.' },
  nestingRelationTypes: ['systems.is-part-of'],
  positions: [],
  freeShapes: [],
};

/** The sample with a second view of the same model, from another perspective. */
const twoViews: ProjectSnapshot = { ...sample, views: [...sample.views, SECURITY] };

const PATIENT = 'patient';
const AGENT = 'clinic-booking/booking-agent';
const API = 'clinic-booking/scheduling/appointments-api';
const REMINDERS = 'clinic-booking/scheduling/reminder-service';
const NOTE = 'calendar-note';

interface HarnessProps {
  selection: Selection;
  store: EmphasisStore;
  onOpen?: (view: Id) => void;
  onSelect?: (selection: Selection) => void;
  onReveal?: (key: string) => void;
  onScene?: (scene: Scene | undefined) => void;
}

/** Keeps the editor as the shell does: the open view, its scene and the explorer, with the toolbar. */
function Harness({ selection, store, onOpen, onSelect, onReveal, onScene }: HarnessProps) {
  const [viewId, setViewId] = useState<Id>('system-overview');
  const scene = useMemo(() => buildScene(twoViews, viewId), [viewId]);
  onScene?.(scene);
  const explore = useExplorer({ project: twoViews, viewId, scene, selection, emphasis: store });
  const editor: Editor = {
    project: twoViews,
    definitions: definitionsOf(twoViews.packages),
    viewId,
    scene,
    selection,
    select: (next) => onSelect?.(next),
    send: undefined,
    reveal: (key) => onReveal?.(key),
    openView: (id) => {
      onOpen?.(id);
      setViewId(id);
    },
    explore,
  };
  return (
    <EditorContext.Provider value={editor}>
      <CanvasToolbar
        project={twoViews}
        editable={false}
        scale={1}
        onAdd={() => undefined}
        onAddNote={() => undefined}
        onAddArrow={() => undefined}
        onZoom={() => undefined}
        onFit={() => undefined}
      />
    </EditorContext.Provider>
  );
}

function setup(selection: Selection = EMPTY_SELECTION, props: Partial<HarnessProps> = {}) {
  const store = new EmphasisStore();
  const result = render(<Harness selection={selection} store={store} {...props} />);
  const rerender = (next: Selection) =>
    result.rerender(<Harness selection={next} store={store} {...props} />);
  return { store, rerender };
}

const agent = selectionOf([{ kind: 'element', id: 'booking-agent' }]);

function sorted(set: ReadonlySet<string> | undefined): string[] {
  return [...(set ?? [])].sort();
}

function openFilters(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  return screen.getByRole('dialog', { name: 'Filters' });
}

describe('the perspective switcher', () => {
  it('names each view of the model by its perspective, and opens the one chosen', () => {
    const onOpen = vi.fn();
    setup(EMPTY_SELECTION, { onOpen });
    const switcher = screen.getByRole('combobox', { name: 'Perspective' });
    expect(
      within(switcher)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Data flow — System overview', 'Security']);
    expect(switcher).toHaveValue('system-overview');
    fireEvent.change(switcher, { target: { value: 'security' } });
    expect(onOpen).toHaveBeenCalledWith('security');
    expect(screen.getByRole('combobox', { name: 'Perspective' })).toHaveValue('security');
  });

  it('shows only inside the shell, which keeps the editor', () => {
    render(
      <CanvasToolbar
        project={sample}
        editable
        scale={1}
        onAdd={() => undefined}
        onAddNote={() => undefined}
        onAddArrow={() => undefined}
        onZoom={() => undefined}
        onFit={() => undefined}
      />,
    );
    expect(screen.queryByRole('combobox', { name: 'Perspective' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Focus' })).not.toBeInTheDocument();
  });
});

describe('the filters', () => {
  it('hide the shapes of a component unchecked, with the relations that end on them', () => {
    const { store } = setup();
    const panel = openFilters();
    const service = within(panel).getByRole('checkbox', { name: /^Service/ });
    expect(service).toBeChecked();
    fireEvent.click(service);
    expect(service).not.toBeChecked();
    expect(sorted(store.get().hidden)).toEqual(
      [API, REMINDERS, 'agent-to-api', 'api-reads-db', 'api-writes-db', 'api-to-reminders'].sort(),
    );
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Exploring' })).toHaveTextContent(
      'The filters hide 2 element shapes and 4 relations.',
    );
  });

  it('hide the relations of a relation type unchecked', () => {
    const { store } = setup();
    fireEvent.click(within(openFilters()).getByRole('checkbox', { name: /^reads from/ }));
    expect(sorted(store.get().hidden)).toEqual(['api-reads-db']);
  });

  it('hide or show every choice of a list at once', () => {
    const { store } = setup();
    const panel = openFilters();
    const [components] = within(panel).getAllByRole('group');
    fireEvent.click(within(components as HTMLElement).getByRole('button', { name: 'Hide all' }));
    expect(store.get().hidden?.has(PATIENT)).toBe(true);
    fireEvent.click(within(components as HTMLElement).getByRole('button', { name: 'Show all' }));
    expect(store.get().hidden).toBeUndefined();
  });

  it('show only what meets a condition on an attribute, once it can be tested', () => {
    const { store } = setup();
    const panel = openFilters();
    fireEvent.click(within(panel).getByRole('button', { name: 'Add a condition' }));
    const attribute = within(panel).getByRole('combobox', { name: 'Attribute' });
    expect(attribute).toHaveFocus();
    fireEvent.change(attribute, { target: { value: 'owner' } });
    expect(within(panel).getByText('Type a value.')).toBeInTheDocument();
    expect(store.get().hidden).toBeUndefined();
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Value' }), {
      target: { value: 'Scheduling team' },
    });
    expect(store.get().hidden?.has(PATIENT)).toBe(true);
    expect(store.get().hidden?.has(API)).toBe(false);
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Test' }), {
      target: { value: 'unset' },
    });
    expect(within(panel).queryByRole('textbox', { name: 'Value' })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove the condition on “owner”' }));
    expect(store.get().hidden).toBeUndefined();
  });

  it('show everything again at once', () => {
    const { store } = setup();
    fireEvent.click(within(openFilters()).getByRole('checkbox', { name: /^Person/ }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Exploring' })).getByRole('button', {
        name: 'Show everything',
      }),
    );
    expect(store.get().hidden).toBeUndefined();
    expect(screen.queryByRole('group', { name: 'Exploring' })).not.toBeInTheDocument();
  });

  it('close with Escape, and give the focus back to their button', () => {
    setup();
    const panel = openFilters();
    expect(within(panel).getAllByRole('checkbox')[0]).toHaveFocus();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus();
  });

  it('are kept for each view', () => {
    const { store } = setup();
    fireEvent.click(within(openFilters()).getByRole('checkbox', { name: /^Person/ }));
    expect(store.get().hidden?.has(PATIENT)).toBe(true);
    const switcher = screen.getByRole('combobox', { name: 'Perspective' });
    fireEvent.change(switcher, { target: { value: 'security' } });
    expect(store.get().hidden).toBeUndefined();
    fireEvent.change(switcher, { target: { value: 'system-overview' } });
    expect(store.get().hidden?.has(PATIENT)).toBe(true);
  });

  it('tell the keys what the canvas hides, with what every other source hides', () => {
    let scene: Scene | undefined;
    const { store } = setup(EMPTY_SELECTION, { onScene: (each) => (scene = each) });
    fireEvent.click(within(openFilters()).getByRole('checkbox', { name: /^Person/ }));
    expect(scene && hiddenIn(scene)?.has(PATIENT)).toBe(true);
    act(() => store.set('guidance', { hidden: new Set([NOTE]) }));
    expect(scene && sorted(hiddenIn(scene))).toEqual([NOTE, PATIENT, 'patient-to-whatsapp']);
  });
});

describe('focus mode', () => {
  it('dims what the selection does not reach, as far and in the direction chosen', () => {
    const { store } = setup(agent);
    const focus = screen.getByRole('button', { name: 'Focus' });
    fireEvent.click(focus);
    expect(focus).toHaveAttribute('aria-pressed', 'true');
    expect(store.get().dimmed?.has(PATIENT)).toBe(true);
    expect(store.get().dimmed?.has(API)).toBe(false);
    const strip = screen.getByRole('group', { name: 'Exploring' });
    expect(strip).toHaveTextContent('Focus on “Booking agent”');

    fireEvent.change(within(strip).getByRole('combobox', { name: 'Degrees' }), {
      target: { value: '2' },
    });
    expect(store.get().dimmed?.has(PATIENT)).toBe(false);
    fireEvent.change(within(strip).getByRole('combobox', { name: 'Direction' }), {
      target: { value: 'outgoing' },
    });
    expect(store.get().dimmed?.has('clinic-booking/whatsapp')).toBe(true);
    fireEvent.change(within(strip).getByRole('combobox', { name: 'Degrees' }), {
      target: { value: 'all' },
    });
    expect(store.get().dimmed?.has(REMINDERS)).toBe(false);
  });

  it('isolates: hides what the selection does not reach', () => {
    const { store } = setup(agent);
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Isolate' }));
    expect(store.get().hidden?.has(PATIENT)).toBe(true);
    expect(store.get().hidden?.has(NOTE)).toBe(true);
    // The containers of what it reaches stay, dimmed.
    expect(store.get().dimmed?.has('clinic-booking')).toBe(true);
  });

  it('follows the selection, and stays where it was once nothing is selected', () => {
    const { store, rerender } = setup(agent);
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    rerender(selectionOf([{ kind: 'element', id: 'patient' }]));
    expect(store.get().dimmed?.has(PATIENT)).toBe(false);
    expect(store.get().dimmed?.has(API)).toBe(true);
    rerender(EMPTY_SELECTION);
    expect(store.get().dimmed?.has(API)).toBe(true);
    expect(screen.getByRole('group', { name: 'Exploring' })).toHaveTextContent(
      'Focus on “Patient”',
    );
  });

  it('asks for a selection while it has nothing to start from', () => {
    const { store } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    expect(store.get().dimmed).toBeUndefined();
    expect(screen.getByRole('group', { name: 'Exploring' })).toHaveTextContent(
      'Focus: select an element or a relation.',
    );
  });

  it('ends from its strip or its button, and the canvas shows everything again', () => {
    const { store } = setup(agent);
    const focus = screen.getByRole('button', { name: 'Focus' });
    fireEvent.click(focus);
    fireEvent.click(screen.getByRole('button', { name: 'End focus' }));
    expect(store.get().dimmed).toBeUndefined();
    expect(focus).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(focus);
    fireEvent.click(focus);
    expect(store.get().dimmed).toBeUndefined();
  });

  it('walks only what the filters leave', () => {
    const { store } = setup(agent);
    fireEvent.click(within(openFilters()).getByRole('checkbox', { name: /^Service/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    // The API is hidden by the filters, not dimmed by focus.
    expect(store.get().dimmed?.has(API)).toBe(false);
    expect(store.get().hidden?.has(API)).toBe(true);
  });
});

describe('following a relation', () => {
  it('goes to either end of the selected relation, and shows it', () => {
    const onSelect = vi.fn();
    const onReveal = vi.fn();
    setup(selectionOf([{ kind: 'relation', id: 'agent-to-api' }]), { onSelect, onReveal });
    const follow = screen.getByRole('group', { name: 'Follow the relation' });
    fireEvent.click(within(follow).getByRole('button', { name: '→ Appointments API' }));
    expect(onSelect).toHaveBeenCalledWith(
      selectionOf([{ kind: 'element', id: 'appointments-api' }]),
    );
    expect(onReveal).toHaveBeenCalledWith(API);
    fireEvent.click(within(follow).getByRole('button', { name: '← Booking agent' }));
    expect(onReveal).toHaveBeenLastCalledWith(AGENT);
  });

  it('is offered only while one relation alone is selected', () => {
    setup(agent);
    expect(screen.queryByRole('group', { name: 'Follow the relation' })).not.toBeInTheDocument();
  });
});

describe('screen readers', () => {
  it('hear what the filters and focus do', () => {
    setup(agent);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    });
    const explore = screen.getByRole('group', { name: 'Explore' });
    expect(within(explore).getByRole('status')).toHaveTextContent('Focus on “Booking agent”.');
  });
});
