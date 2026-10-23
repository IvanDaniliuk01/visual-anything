import type { ProjectSnapshot } from '@visual-anything/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { Shell } from './Shell';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample();

/** The list item that holds the element with this name in the model panel's tree. */
function treeItem(panel: HTMLElement, name: string): HTMLElement {
  const item = within(panel).getByText(name).closest('li');
  if (!item) throw new Error(`${name} is not in a list item.`);
  return item;
}

/** The text of the description that goes with a term in a description list. */
function detail(region: HTMLElement, term: string): string {
  const row = within(region).getByText(term).closest('div');
  return row?.querySelector('dd')?.textContent ?? '';
}

describe('Shell', () => {
  it('shows the product, the project and the open view in the header', () => {
    render(<Shell project={sample} />);
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent('Visual Anything');
    expect(within(header).getByText('My systems')).toBeInTheDocument();
    expect(within(header).getByText('System overview')).toBeInTheDocument();
  });

  it('lays out the header, the model panel, the canvas area and the inspector as landmarks', () => {
    render(<Shell project={sample} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Model' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('img'));
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
  });

  it('shows World’s contents in the model panel as a containment tree', () => {
    render(<Shell project={sample} />);
    const panel = screen.getByRole('complementary', { name: 'Model' });
    expect(within(panel).getByRole('heading', { name: 'World' })).toBeInTheDocument();

    const clinic = treeItem(panel, 'Clinic booking');
    const scheduling = treeItem(panel, 'Scheduling');
    expect(clinic).toContainElement(treeItem(panel, 'WhatsApp channel'));
    expect(clinic).toContainElement(treeItem(panel, 'Booking agent'));
    expect(clinic).toContainElement(scheduling);
    for (const name of ['Appointments API', 'Appointments DB', 'Reminder service']) {
      expect(scheduling).toContainElement(treeItem(panel, name));
    }
    expect(clinic).not.toContainElement(treeItem(panel, 'Patient'));
    expect(treeItem(panel, 'Patient').parentElement).toBe(clinic.parentElement);
  });

  it('shows each element’s component next to its name', () => {
    render(<Shell project={sample} />);
    const panel = screen.getByRole('complementary', { name: 'Model' });
    expect(treeItem(panel, 'Patient')).toHaveTextContent(/^Patient, Person/);
    expect(treeItem(panel, 'WhatsApp channel')).toHaveTextContent(
      /^WhatsApp channel, Chat channel/,
    );
    expect(treeItem(panel, 'Appointments DB')).toHaveTextContent(/^Appointments DB, Database$/);
  });

  it('lists the views, marking the open one, and the scenarios', () => {
    render(<Shell project={sample} />);
    const panel = screen.getByRole('complementary', { name: 'Model' });
    const views = within(panel).getByRole('list', { name: 'Views' });
    const view = within(views).getByRole('listitem');
    expect(view).toHaveTextContent('System overview');
    expect(view).toHaveTextContent('Data flow');
    expect(view).toHaveAttribute('aria-current', 'true');

    const scenarios = within(panel).getByRole('list', { name: 'Scenarios' });
    const scenario = within(scenarios).getByRole('listitem');
    expect(scenario).toHaveTextContent('Patient books an appointment');
    expect(scenario).toHaveTextContent('5 steps');
  });

  it('details the open view in the inspector, with nothing selected', () => {
    render(<Shell project={sample} />);
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('Nothing is selected.')).toBeInTheDocument();
    expect(detail(inspector, 'Name')).toBe('System overview');
    expect(detail(inspector, 'Description')).toBe(
      'How a booking request travels from the patient to the calendar.',
    );
    expect(detail(inspector, 'Perspective')).toContain('Data flow');
    expect(detail(inspector, 'Perspective')).toContain('Who sends what to whom');
    expect(detail(inspector, 'Nesting relation types')).toBe('is part of');
    expect(detail(inspector, 'Element shapes')).toBe('8');
    expect(detail(inspector, 'Relations')).toBe('6');
    expect(detail(inspector, 'Free shapes')).toBe('1');
  });

  it('names the open view in the canvas area’s text alternative', () => {
    render(<Shell project={sample} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'System overview, from the Data flow perspective: 8 element shapes, 6 relations and 1 free shape.',
    );
  });

  it('shows the notice it is given above the panels', () => {
    render(<Shell project={sample} notice="The connection closed." />);
    expect(screen.getByRole('alert')).toHaveTextContent('The connection closed.');
  });

  it('says what is missing in a project without elements, views or scenarios', () => {
    const empty: ProjectSnapshot = {
      ...sample,
      model: { ...sample.model, elements: [], relations: [] },
      views: [],
      scenarios: [],
    };
    render(<Shell project={empty} />);
    const panel = screen.getByRole('complementary', { name: 'Model' });
    expect(within(panel).getByText('World holds no elements yet.')).toBeInTheDocument();
    expect(within(panel).getByText('This project has no views yet.')).toBeInTheDocument();
    expect(within(panel).getByText('This project has no scenarios yet.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByText('There is no view to draw.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('complementary', { name: 'Inspector' })).getByText(
        'No view is open.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
