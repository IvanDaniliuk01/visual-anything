import type { ProjectSnapshot } from '@visual-anything/core';
import { validateFile } from '@visual-anything/schema/validate';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { pageDataOf, readPageData, type PageRead } from './data';
import { PAGE_LANGUAGE_KEY, PAGE_THEME_KEY } from './keys';
import { PagePreferences } from './preferences';
import { ViewerApp } from './Viewer';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const sample = loadSample();
const HOSTILE = '<img src=x onerror=alert(1)><script>alert(2)</script>';

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

/** The page's data read back, as the page reads it. */
function read(project: ProjectSnapshot = sample): PageRead {
  return readPageData(JSON.stringify(pageDataOf(project)), validateFile);
}

/** The page at an address. */
async function open(page: PageRead = read(), hash = '') {
  window.history.replaceState(null, '', `/page.html${hash}`);
  const preferences = new PagePreferences(window);
  const result = render(<ViewerApp read={page} preferences={preferences} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return { ...result, preferences };
}

function canvas(): HTMLElement {
  return screen.getByRole('application');
}

describe('The read-only page', () => {
  it('shows the project, its first view and the tools to read it', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My systems');
    expect(screen.getByRole('combobox', { name: 'View' })).toHaveDisplayValue(
      'System overview (Data flow)',
    );
    const tools = screen.getByRole('toolbar', { name: 'Reading tools' });
    for (const name of ['Find', 'Explore', 'Outline', 'Scenarios', 'About']) {
      expect(within(tools).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(canvas()).toHaveAccessibleName(/^System overview, from the Data flow perspective: /);
  });

  it('has nothing to edit with', async () => {
    await open();
    for (const name of [/undo/i, /redo/i, /add element/i, /delete/i, /rename/i, /record/i]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('opens at the view state its address holds, and shows what is selected', async () => {
    await open(read(), '#view=system-overview&select=booking-agent');
    const details = screen.getByRole('region', { name: 'Selected' });
    expect(within(details).getByRole('heading')).toHaveTextContent('Booking agent');
    expect(within(details).getByText('AI agent')).toBeInTheDocument();
    expect(within(details).getByText('owner')).toBeInTheDocument();
  });

  it('writes a script in a name as text, and runs nothing of it', async () => {
    const named = {
      ...sample,
      model: {
        ...sample.model,
        elements: sample.model.elements.map((element) =>
          element.id === 'booking-agent' ? { ...element, name: HOSTILE } : element,
        ),
      },
    };
    await open(read(named), '#view=system-overview&select=booking-agent');
    const details = screen.getByRole('region', { name: 'Selected' });
    expect(within(details).getByRole('heading')).toHaveTextContent(HOSTILE);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });

  it('selects with the keys, and clears the selection with Escape', async () => {
    await open();
    fireEvent.keyDown(canvas(), { key: 'ArrowRight' });
    expect(screen.getByRole('region', { name: 'Selected' })).toBeInTheDocument();
    fireEvent.keyDown(canvas(), { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Selected' })).not.toBeInTheDocument();
  });

  it('collapses and expands a container in the page only', async () => {
    await open(read(), '#view=system-overview&select=scheduling');
    const before = canvas().getAttribute('aria-label');
    fireEvent.keyDown(canvas(), { key: '−', code: 'Minus', altKey: true });
    const collapsed = canvas().getAttribute('aria-label');
    expect(collapsed).not.toBe(before);
    fireEvent.keyDown(canvas(), { key: '+', code: 'Equal', altKey: true });
    expect(canvas().getAttribute('aria-label')).toBe(before);
  });

  it('opens another view from the view picker', async () => {
    const [first] = sample.views;
    const second = { ...first!, id: 'second', name: 'Second', perspective: { name: 'Security' } };
    await open(read({ ...sample, views: [...sample.views, second] }));
    fireEvent.change(screen.getByRole('combobox', { name: 'View' }), {
      target: { value: 'second' },
    });
    expect(canvas()).toHaveAccessibleName(/^Second, from the Security perspective: /);
  });

  it('filters by component from Explore', async () => {
    await open();
    const before = canvas().getAttribute('aria-label');
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }));
    const explore = screen.getByRole('dialog', { name: 'Explore' });
    fireEvent.click(within(explore).getByRole('checkbox', { name: /^Service/ }));
    expect(within(explore).getByRole('checkbox', { name: /^Service/ })).not.toBeChecked();
    expect(within(explore).getByRole('button', { name: 'Show everything' })).toBeInTheDocument();
    // Filters hide shapes; the view still draws them all.
    expect(canvas().getAttribute('aria-label')).toBe(before);
  });

  it('plays a scenario, step by step', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Scenarios' }));
    fireEvent.click(screen.getByRole('button', { name: /^Patient books an appointment/ }));
    const playback = screen.getByRole('region', {
      name: 'Scenario “Patient books an appointment”',
    });
    expect(within(playback).getByText(/^Step 1 of \d+$/)).toBeInTheDocument();
    fireEvent.click(within(playback).getByRole('button', { name: 'Next' }));
    expect(within(playback).getByText(/^Step 2 of \d+$/)).toBeInTheDocument();
    fireEvent.click(within(playback).getByRole('button', { name: 'Close the scenario' }));
    expect(screen.queryByRole('region', { name: /^Scenario/ })).not.toBeInTheDocument();
  });

  it('lists the packages it uses in About', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    const about = screen.getByRole('dialog', { name: 'My systems' });
    expect(within(about).getByText('Systems')).toBeInTheDocument();
    expect(within(about).getByText('Clinic')).toBeInTheDocument();
    expect(within(about).getByText(/built into Visual Anything/)).toBeInTheDocument();
    expect(within(about).getByText(/the project’s own/)).toBeInTheDocument();
    fireEvent.keyDown(about, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'My systems' })).not.toBeInTheDocument();
  });

  it('keeps the reader’s theme and language, and reads in Spanish', async () => {
    await open();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem(PAGE_THEME_KEY)).toBe('dark');
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'es' },
    });
    expect(window.localStorage.getItem(PAGE_LANGUAGE_KEY)).toBe('es');
    expect(screen.getByRole('toolbar', { name: 'Herramientas de lectura' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
  });

  it('says why it cannot show a project whose data is not valid', async () => {
    await open({ ok: false, problems: ['This page’s data is not a project.'] });
    expect(screen.getByRole('alert')).toHaveTextContent('This page cannot show its project');
    expect(screen.getByRole('alert')).toHaveTextContent('This page’s data is not a project.');
  });
});

describe('A view with a scope, in the read-only page', () => {
  /** The sample, its view leaving the Reminder service out (ADR-0040). */
  const scoped: ProjectSnapshot = {
    ...sample,
    views: sample.views.map((view) => ({ ...view, scope: { leftOut: ['reminder-service'] } })),
  };

  it('shows only what the scope shows, and says which relations leave the view', async () => {
    await open(read(scoped), '#view=system-overview&select=appointments-api');
    expect(canvas()).toHaveAccessibleName(/: 7 element shapes/);
    const details = screen.getByRole('region', { name: 'Selected' });
    expect(within(details).getByText(/^1 relation leaves this view: /)).toBeInTheDocument();
  });

  it('finds what the scope leaves out, and offers no way to add it to the view', async () => {
    await open(read(scoped));
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    const field = screen.getByRole('combobox', { name: 'Find in the project' });
    fireEvent.change(field, { target: { value: 'Reminder' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    expect(screen.queryByRole('option', { name: /^Add to this view/ })).not.toBeInTheDocument();
  });

  // Tours (ADR 0058).
  it('plays a tour full screen, step by step by keys, and hides its own header meanwhile', async () => {
    const { container } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Tours' }));
    const chooser = screen.getByRole('dialog', { name: 'Tours' });
    fireEvent.click(
      within(chooser).getByRole('button', { name: 'Play “How booking works” full screen' }),
    );
    const page = container.querySelector('.viewer');
    expect(page).toHaveClass('tour-playing');
    expect(screen.getByRole('article')).toHaveTextContent('Clinic booking');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByRole('article')).toHaveTextContent('The booking agent');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('article')).toBeNull();
    expect(page).not.toHaveClass('tour-playing');
  });

  it('offers no tours when the project has none', async () => {
    await open(read({ ...sample, tours: [] }));
    expect(screen.queryByRole('button', { name: 'Tours' })).not.toBeInTheDocument();
  });

  it('shows the outline without a menu to leave anything out', async () => {
    await open(read(scoped), '#view=system-overview&select=appointments-api');
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    const row = screen.getByRole('treeitem', { name: /^Appointments API/ });
    fireEvent.keyDown(row, { key: 'F10', shiftKey: true });
    fireEvent.contextMenu(row);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Leave out of this view/ }),
    ).not.toBeInTheDocument();
  });
});
