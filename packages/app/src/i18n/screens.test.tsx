import { componentOrEssence, definitionsOf, executeCommand } from '@visual-anything/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { recordedLabel, stepOf } from '../scenarios/commands';
import { Shell } from '../shell/Shell';
import { loadSample } from '../test/sample';
import { LanguageProvider } from './LanguageProvider';
import { translatorFor } from './t';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample();

function renderInSpanish() {
  const onCommand = vi.fn<SendCommand>((command) => {
    const outcome = executeCommand(sample, command);
    return Promise.resolve(outcome.ok ? { ok: true, created: outcome.created } : { ok: false });
  });
  return render(
    <LanguageProvider language="es">
      <Shell project={sample} onCommand={onCommand} />
    </LanguageProvider>,
  );
}

describe('the shell in Spanish', () => {
  it('names World, the views and the scenarios, and the built-in components', () => {
    renderInSpanish();
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo' }));
    expect(screen.getByRole('heading', { name: 'Mundo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vistas' })).toBeInTheDocument();
    const world = screen.getByRole('tree', { name: 'Mundo' });
    const api = within(world).getByRole('treeitem', { name: /^Appointments API/ });
    // The person's own names stay as written; the built-in component's is in Spanish.
    expect(api).toHaveTextContent('Appointments API, Servicio');
    const calendar = componentOrEssence(definitionsOf(sample.packages), 'clinic.calendar');
    expect(within(world).getByRole('treeitem', { name: /^Appointments DB/ })).toHaveTextContent(
      `Appointments DB, ${calendar.name}`,
    );
  });

  it('opens a view’s settings in Spanish, with the nesting relation types by their Spanish names', () => {
    renderInSpanish();
    fireEvent.click(screen.getByRole('tab', { name: 'Modelo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes de "System overview"' }));
    const settings = screen.getByRole('group', { name: 'Ajustes de "System overview"' });
    expect(within(settings).getByLabelText('Nombre')).toHaveValue('System overview');
    expect(
      within(settings).getByRole('group', { name: 'Tipos de relación que anidan' }),
    ).toBeInTheDocument();
    expect(within(settings).getByLabelText('es parte de')).toBeInTheDocument();
  });

  it('shows the scenario panel in Spanish', () => {
    renderInSpanish();
    const panel = screen.getByRole('complementary', { name: 'Escenarios' });
    expect(
      within(panel).getByRole('list', { name: 'Escenarios del proyecto' }),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Nuevo escenario' })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: /^Patient books an appointment/ }));
    expect(within(panel).getByRole('group', { name: 'Reproducción' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Reproducir' })).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Pasos' })).toBeInTheDocument();
  });

  it('shows the outline in Spanish', () => {
    renderInSpanish();
    fireEvent.click(screen.getByRole('tab', { name: 'Esquema' }));
    const outline = screen.getByRole('tree', { name: 'Esquema de System overview' });
    expect(within(outline).getAllByRole('treeitem')[0]).toHaveTextContent(/, (Persona|Sistema)/);
  });
});

describe('the scenarios’ labels in the undo history', () => {
  const es = translatorFor('es');
  const scenario = sample.scenarios[0];

  it('stay English, and read in Spanish where they are shown', () => {
    if (!scenario) throw new Error('The sample has a scenario.');
    const recorded = recordedLabel(scenario, {
      change: 'new-step',
      at: 2,
      steps: scenario.steps,
    } as unknown as Parameters<typeof recordedLabel>[1]);
    expect(recorded).toBe(`Record step 3 of “${scenario.name}”`);
    expect(es.message(recorded)).toBe(`Grabar el paso 3 de “${scenario.name}”`);
    const added = recordedLabel(scenario, {
      change: 'added',
      at: 1,
    } as unknown as Parameters<typeof recordedLabel>[1]);
    expect(es.message(added)).toBe(`Agregar una relación al paso 2 de “${scenario.name}”`);
    const removed = recordedLabel(scenario, {
      change: 'removed',
      at: 0,
    } as unknown as Parameters<typeof recordedLabel>[1]);
    expect(es.message(removed)).toBe(`Sacar una relación del paso 1 de “${scenario.name}”`);
    expect(es.message(`Describe ${stepOf(scenario, 3)}`)).toBe(
      `Describir el paso 4 de “${scenario.name}”`,
    );
  });
});
