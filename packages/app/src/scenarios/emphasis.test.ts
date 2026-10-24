import { scenarioTimeline, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { buildScene, type Scene } from '../canvas/scene';
import { loadSample } from '../test/sample';
import { highlightOf, markersOf } from './emphasis';

const sample = loadSample();

/** The sample with its view collapsing these containers, as interface I1 stores them. */
function collapsing(collapsed: Id[]): ProjectSnapshot {
  const [view, ...rest] = sample.views;
  const folded: ViewFile & { collapsed?: Id[] } = { ...view!, collapsed };
  return { ...sample, views: [folded, ...rest] };
}

function setUp(project: ProjectSnapshot) {
  const view = project.views[0]!;
  const scene = buildScene(project, view.id);
  const timeline = scenarioTimeline(project, project.scenarios[0]!);
  return { view, scene, timeline };
}

describe('highlightOf', () => {
  it('highlights a step’s relations and the shapes of their ends', () => {
    const { view, scene, timeline } = setUp(sample);
    expect([...highlightOf(sample, view, scene, timeline.entries[2]!)].sort()).toEqual([
      'agent-to-api',
      'clinic-booking/booking-agent',
      'clinic-booking/scheduling/appointments-api',
    ]);
  });

  it('highlights every relation of a step with several at once', () => {
    const { view, scene, timeline } = setUp(sample);
    const keys = highlightOf(sample, view, scene, timeline.entries[4]!);
    expect(keys).toContain('api-writes-db');
    expect(keys).toContain('api-to-reminders');
    expect(keys).toContain('clinic-booking/scheduling/reminder-service');
  });

  it('highlights the collapsed container an aggregated step happens inside', () => {
    const project = collapsing(['scheduling']);
    const { view, scene, timeline } = setUp(project);
    const aggregated = timeline.entries.find((entry) => entry.kind === 'aggregated')!;
    expect(aggregated).toMatchObject({ count: 2, container: 'scheduling' });
    expect([...highlightOf(project, view, scene, aggregated)]).toEqual([
      'clinic-booking/scheduling',
    ]);
  });

  it('shows an end hidden inside a collapsed container by the container’s shape', () => {
    const project = collapsing(['scheduling']);
    const { view, scene, timeline } = setUp(project);
    // The agent's call goes into Scheduling, which hides the Appointments API.
    expect([...highlightOf(project, view, scene, timeline.entries[2]!)].sort()).toEqual([
      'agent-to-api',
      'clinic-booking/booking-agent',
      'clinic-booking/scheduling',
    ]);
  });

  it('shows it by the outermost collapsed container, also when the scene leaves hidden shapes out', () => {
    const project = collapsing(['scheduling', 'clinic-booking']);
    const { view, scene, timeline } = setUp(project);
    const hiding: Scene = {
      ...scene,
      shapes: scene.shapes.filter((shape) => !shape.key.includes('/')),
    };
    for (const shown of [scene, hiding]) {
      expect([...highlightOf(project, view, shown, timeline.entries[0]!)].sort()).toEqual([
        'clinic-booking',
        'patient',
        'patient-to-whatsapp',
      ]);
    }
  });

  it('highlights the relation a relation ends on', () => {
    const governs = {
      ...sample,
      model: {
        ...sample.model,
        relations: [
          ...sample.model.relations,
          {
            id: 'patient-reads-call',
            relationType: 'systems.reads-from',
            from: 'patient',
            to: 'agent-to-api',
          },
        ],
      },
      scenarios: [
        {
          ...sample.scenarios[0]!,
          steps: [{ id: 'watch', description: '', relations: ['patient-reads-call'] }],
        },
      ],
    };
    const { view, scene, timeline } = setUp(governs);
    expect([...highlightOf(governs, view, scene, timeline.entries[0]!)].sort()).toEqual([
      'agent-to-api',
      'patient',
      'patient-reads-call',
    ]);
  });

  it('highlights what is left of a broken step', () => {
    const broken = {
      ...sample,
      scenarios: [
        {
          ...sample.scenarios[0]!,
          steps: [{ id: 'lost', description: '', relations: ['gone', 'api-reads-db'] }],
        },
      ],
    };
    const { view, scene, timeline } = setUp(broken);
    expect([...highlightOf(broken, view, scene, timeline.entries[0]!)]).toContain('api-reads-db');
  });
});

describe('markersOf', () => {
  it('puts a marker on each relation of a step, at the progress given', () => {
    const { view, timeline } = setUp(sample);
    expect(markersOf(sample, view, timeline.entries[4]!, 0.25)).toEqual([
      { relation: 'api-writes-db', progress: 0.25 },
      { relation: 'api-to-reminders', progress: 0.25 },
    ]);
  });

  it('puts none on an aggregated step, nor on a relation the view draws as nesting', () => {
    const project = collapsing(['scheduling']);
    const { view, timeline } = setUp(project);
    const aggregated = timeline.entries.find((entry) => entry.kind === 'aggregated')!;
    expect(markersOf(project, view, aggregated, 0.5)).toEqual([]);
    const nesting = {
      ...sample,
      scenarios: [
        {
          ...sample.scenarios[0]!,
          steps: [{ id: 'nest', description: '', relations: ['api-in-scheduling'] }],
        },
      ],
    };
    const nested = setUp(nesting);
    expect(markersOf(nesting, nested.view, nested.timeline.entries[0]!, 0.5)).toEqual([]);
  });
});
