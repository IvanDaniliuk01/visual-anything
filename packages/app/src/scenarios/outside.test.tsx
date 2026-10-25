/**
 * A step outside the view, in playback (CONTEXT.md, ADR-0040): the step panel says so, with Add to
 * this view for its ends, and no marker travels along a relation the view's scope does not show.
 */
import { scenarioTimeline, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Scope } from '@visual-anything/schema';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { markersOf } from './emphasis';
import { OutsideNote } from './OutsideNote';

const VIEW = 'system-overview';

function scoped(scope: Scope | undefined): ProjectSnapshot {
  const project = loadSample();
  return {
    ...project,
    views: project.views.map((view) => (view.id === VIEW ? { ...view, scope } : view)),
  };
}

describe('a step outside the view', () => {
  const project = scoped({ leftOut: ['patient'] });
  const scenario = project.scenarios.find((each) => each.view === VIEW)!;
  const timeline = scenarioTimeline(project, scenario);
  const outside = timeline.entries.findIndex((entry) => entry.kind === 'step' && entry.outside);

  it('is one of the sample scenario’s, which plays on past it', () => {
    expect(outside).toBeGreaterThanOrEqual(0);
    expect(timeline.entries.length).toBe(scenario.steps.length);
  });

  it('says so in the step panel, and adds its ends as one command', () => {
    const step = scenario.steps[timeline.entries[outside]!.first]!;
    const send = vi.fn<(command: Command, done?: string) => Promise<boolean>>(() =>
      Promise.resolve(true),
    );
    render(<OutsideNote project={project} scenario={scenario} step={step} editable send={send} />);
    expect(screen.getByText('Outside the view')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add its end to this view' }));
    expect(send).toHaveBeenCalledWith(
      { type: 'add-to-view', view: VIEW, elements: ['patient'] },
      'Add "Patient" to "System overview".',
    );
  });

  it('has no marker on a relation the scope does not show', () => {
    const view = project.views.find((each) => each.id === VIEW)!;
    expect(markersOf(project, view, timeline.entries[outside]!, 0.5)).toEqual([]);
    const whole = scoped(undefined);
    const wholeView = whole.views.find((each) => each.id === VIEW)!;
    const entry = scenarioTimeline(whole, scenario).entries[outside]!;
    expect(markersOf(whole, wholeView, entry, 0.5).length).toBeGreaterThan(0);
  });
});
