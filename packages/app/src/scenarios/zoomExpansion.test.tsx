/**
 * Playback over a container the zoom expanded (ADR 0055): while the canvas shows it expanded, its
 * steps play one by one on their own lines, as the canvas draws them, and the panel brings them into
 * sight there; once the zoom collapses it again, they play as one aggregated step on it.
 */
import { definitionsIn, executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NOT_EXPANDED, viewAsDrawn } from '../canvas/overlays/collapsed';
import {
  ZoomExpansion,
  ZoomExpansionContext,
  useExpandedByZoom,
} from '../canvas/overlays/useZoomExpansion';
import { buildScene, buildSceneAfresh } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { EMPTY_SELECTION } from '../editor/selection';
import { withoutDecisions } from '../test/sample';
import { ScenarioPanel } from './ScenarioPanel';
import { ScenarioSession, type Clock } from './session';

const VIEW = 'system-overview';
const VIEWPORT = { width: 800, height: 600 };

/** The sample with Scheduling collapsed, its System component expanding from scale 2. */
function project(): ProjectSnapshot {
  // The sample's scenario as it plays without its decision, which DecisionPanel.test.tsx covers.
  const sample = withoutDecisions();
  const collapsed: ProjectSnapshot = {
    ...sample,
    views: sample.views.map((view) =>
      view.id === VIEW ? { ...view, collapsed: ['scheduling'] } : view,
    ),
  };
  const outcome = executeCommand(collapsed, {
    type: 'set-component-appearance',
    component: 'systems.system',
    appearanceTraits: { expandFrom: 2 },
  });
  if (!outcome.ok) throw new Error('Refused.');
  return outcome.state;
}

/** A clock that never moves on by itself: playback stays where the test puts it. */
const STILL: Clock = { now: () => 0, request: () => 1, cancel: () => {} };

/** The scenario panel over the canvas's view, built with what the zoom expands, as the shell does. */
function Harness({
  state,
  zoom,
  emphasis,
  session,
  reveal,
}: {
  state: ProjectSnapshot;
  zoom: ZoomExpansion;
  emphasis: EmphasisStore;
  session: ScenarioSession;
  reveal: (key: string) => void;
}) {
  const expanded = useExpandedByZoom(zoom, VIEW);
  const scene = useMemo(() => buildScene(state, VIEW, expanded), [state, expanded]);
  const editor = useMemo<Editor>(
    () => ({
      project: state,
      definitions: definitionsIn(state),
      viewId: VIEW,
      scene,
      selection: EMPTY_SELECTION,
      select: () => {},
      send: undefined,
      reveal,
    }),
    [state, scene, reveal],
  );
  return (
    <EditorContext.Provider value={editor}>
      <EmphasisContext.Provider value={emphasis}>
        <ZoomExpansionContext value={zoom}>
          <ScenarioPanel session={session} />
        </ZoomExpansionContext>
      </EmphasisContext.Provider>
    </EditorContext.Provider>
  );
}

function setUp() {
  const state = project();
  const view = state.views.find((each) => each.id === VIEW) as ViewFile;
  const zoom = new ZoomExpansion();
  const emphasis = new EmphasisStore();
  const session = new ScenarioSession(STILL);
  const reveal = vi.fn<(key: string) => void>();
  render(
    <Harness state={state} zoom={zoom} emphasis={emphasis} session={session} reveal={reveal} />,
  );
  // Where the canvas looks: at Scheduling, as the scene draws it collapsed.
  const collapsedScene = buildSceneAfresh(state, VIEW);
  const scheduling = collapsedScene.shapes.find((shape) => shape.element === 'scheduling');
  if (!scheduling) throw new Error('No Scheduling.');
  const zoomTo = (scale: number) =>
    act(() =>
      zoom.follow(state, view, collapsedScene, {
        camera: {
          x: VIEWPORT.width / 2 - (scheduling.rect.x + scheduling.rect.width / 2) * scale,
          y: VIEWPORT.height / 2 - (scheduling.rect.y + scheduling.rect.height / 2) * scale,
          scale,
        },
        viewport: VIEWPORT,
      }),
    );
  act(() => session.open(state.scenarios[0]?.id ?? ''));
  return { zoom, emphasis, session, reveal, zoomTo };
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Scenarios' });
}

/** What each step the panel lists says. */
function listed(): string[] {
  const list = within(panel()).getByRole('list', { name: 'Steps' });
  return [...list.querySelectorAll(':scope > li > .scenario-step-head')].map(
    (head) => head.textContent ?? '',
  );
}

function currentStep(): string {
  return panel().querySelector('[aria-current="step"] .scenario-step-head')?.textContent ?? '';
}

describe('playback over a container the zoom expanded', () => {
  it('plays its steps one by one on their own lines, and as one on the container once collapsed again', () => {
    const { emphasis, reveal, zoomTo } = setUp();

    // Collapsed in the view: steps 4 and 5 happen inside Scheduling, and play as one on it.
    expect(listed().at(-1)).toMatch(/^4–5.*2 steps inside “Scheduling”/);
    fireEvent.click(within(panel()).getByRole('button', { name: /^4–5/ }));
    expect([...(emphasis.get().highlighted ?? [])]).toEqual(['clinic-booking/scheduling']);
    expect(emphasis.get().markers).toBeUndefined();

    // Zoomed into it, the canvas shows it expanded, and so does playback.
    zoomTo(2.5);
    expect(listed().map((text) => text.slice(0, 1))).toEqual(['1', '2', '3', '4', '5']);
    expect(currentStep()).toBe('4The API reads the free slots from the calendar.');
    expect([...(emphasis.get().highlighted ?? [])].sort()).toEqual([
      'api-reads-db',
      'clinic-booking/scheduling/appointments-api',
      'clinic-booking/scheduling/appointments-db',
    ]);
    expect(emphasis.get().markers).toEqual([{ relation: 'api-reads-db', progress: 0 }]);
    // Bringing the step into sight goes to its own line, not to the container.
    fireEvent.click(within(panel()).getByRole('button', { name: 'Show on the canvas' }));
    expect(reveal).toHaveBeenLastCalledWith('api-reads-db');

    // Zoomed out below 90% of where it expands, it collapses again, and the steps go back to it.
    zoomTo(1.7);
    expect(listed().at(-1)).toMatch(/^4–5.*2 steps inside “Scheduling”/);
    expect(currentStep()).toMatch(/^4–5/);
    expect([...(emphasis.get().highlighted ?? [])]).toEqual(['clinic-booking/scheduling']);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Show on the canvas' }));
    expect(reveal).toHaveBeenLastCalledWith('clinic-booking/scheduling');
  });

  it('keeps playing the aggregate while the zoom stays out of the container', () => {
    const { emphasis, zoomTo } = setUp();
    fireEvent.click(within(panel()).getByRole('button', { name: /^4–5/ }));
    zoomTo(1.9);
    expect(currentStep()).toMatch(/^4–5/);
    expect([...(emphasis.get().highlighted ?? [])]).toEqual(['clinic-booking/scheduling']);
  });
});

describe('viewAsDrawn', () => {
  const view = project().views.find((each) => each.id === VIEW) as ViewFile;

  it('leaves out of what the view keeps collapsed what the zoom expands', () => {
    const expanded = new Set(['scheduling']);
    const drawn = viewAsDrawn(view, expanded);
    expect(drawn.collapsed).toEqual([]);
    expect(drawn).toEqual({ ...view, collapsed: [] });
    // The view's own file is left as it is.
    expect(view.collapsed).toEqual(['scheduling']);
  });

  it('is the view itself while the zoom expands none of its collapsed containers', () => {
    expect(viewAsDrawn(view, NOT_EXPANDED)).toBe(view);
    expect(viewAsDrawn(view, new Set(['patient']))).toBe(view);
  });

  it('is the same object for the same view and set, so that what reads it changes only with them', () => {
    const expanded = new Set(['scheduling']);
    expect(viewAsDrawn(view, expanded)).toBe(viewAsDrawn(view, expanded));
    expect(viewAsDrawn(view, new Set(['scheduling']))).not.toBe(viewAsDrawn(view, expanded));
  });
});
