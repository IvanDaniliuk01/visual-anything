/**
 * The scene of a view that leaves out relation types (ADR 0064): it draws no line for their
 * relations, aggregates none of them into a collapsed container's relations, and counts none of them
 * among the relations that leave the view; it still draws every shape, and a relation type it nests
 * by still arranges it. Search groups such a relation under no view that leaves it out.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { RelationTypeLeftOut, Scope, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { viewShows } from '../search/groups';
import { loadSample } from '../test/sample';
import { buildScene, buildSceneAfresh, type Scene } from './scene';

const VIEW = 'system-overview';

function leaving(
  relationTypesLeftOut: RelationTypeLeftOut[] | undefined,
  scope?: Scope,
  project: ProjectSnapshot = loadSample(),
): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((view): ViewFile => {
      if (view.id !== VIEW) return view;
      return {
        ...view,
        ...(relationTypesLeftOut === undefined ? {} : { relationTypesLeftOut }),
        ...(scope === undefined ? {} : { scope }),
      };
    }),
  };
}

function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

const linesOf = (scene: Scene) => scene.relations.map((line) => line.relation);

describe('the scene of a view that leaves out relation types', () => {
  it('draws no line for their relations, and every shape still', () => {
    const whole = buildScene(leaving(undefined), VIEW);
    const project = leaving([{ relationType: 'systems.communicates-with' }]);
    const scene = buildScene(project, VIEW);
    expect(linesOf(scene)).not.toContain('agent-to-api');
    expect(linesOf(scene)).not.toContain('patient-to-whatsapp');
    expect(linesOf(scene)).toContain('api-reads-db');
    expect(scene.shapes.map((shape) => shape.key)).toEqual(whole.shapes.map((shape) => shape.key));
    expect(scene).toEqual(buildSceneAfresh(project, VIEW));
  });

  it('leaves out what derives from a relation type, unless exactly that one', () => {
    const all = buildScene(leaving([{ relationType: 'relates-to' }]), VIEW);
    expect(linesOf(all)).toEqual([]);
    // The view still nests by "is part of", which "relates to" covers.
    expect(all.shapes.some((shape) => shape.key === 'clinic-booking/scheduling')).toBe(true);
    const exactly = buildScene(leaving([{ relationType: 'relates-to', exactly: true }]), VIEW);
    expect(linesOf(exactly)).toEqual(linesOf(buildScene(leaving(undefined), VIEW)));
  });

  it('aggregates none of their relations into a collapsed container', () => {
    const collapsed = run(leaving(undefined), {
      type: 'set-collapsed',
      view: VIEW,
      elements: ['clinic-booking'],
      collapsed: true,
    });
    const aggregated = (scene: Scene) =>
      scene.relations.flatMap((line) => line.aggregate?.relations ?? []);
    expect(aggregated(buildScene(collapsed, VIEW))).toContain('patient-to-whatsapp');
    const without = run(collapsed, {
      type: 'set-relation-types-left-out',
      view: VIEW,
      relationTypes: [{ relationType: 'systems.communicates-with' }],
    });
    const scene = buildScene(without, VIEW);
    expect(aggregated(scene)).not.toContain('patient-to-whatsapp');
    expect(linesOf(scene)).toEqual([]);
    expect(scene).toEqual(buildSceneAfresh(without, VIEW));
  });

  it('counts none of their relations among those that leave the view', () => {
    const scoped = leaving(undefined, { leftOut: ['appointments-db', 'patient'] });
    const counted = (project: ProjectSnapshot, element: string) =>
      buildScene(project, VIEW).shapes.find((shape) => shape.element === element)?.leaving;
    expect(counted(scoped, 'appointments-api')).toEqual(['api-reads-db', 'api-writes-db']);
    expect(counted(scoped, 'whatsapp')).toEqual(['patient-to-whatsapp']);
    const left = leaving([{ relationType: 'systems.writes-to' }], {
      leftOut: ['appointments-db', 'patient'],
    });
    expect(counted(left, 'appointments-api')).toEqual(['api-reads-db']);
    const none = leaving([{ relationType: 'relates-to' }], {
      leftOut: ['appointments-db', 'patient'],
    });
    expect(buildScene(none, VIEW).shapes.some((shape) => shape.leaving)).toBe(false);
  });

  it('draws the lines again once the view stops leaving them out, as a build from nothing does', () => {
    const left = run(leaving(undefined), {
      type: 'set-relation-types-left-out',
      view: VIEW,
      relationTypes: [{ relationType: 'systems.reads-from' }],
    });
    expect(linesOf(buildScene(left, VIEW))).not.toContain('api-reads-db');
    const back = run(left, { type: 'set-relation-types-left-out', view: VIEW, relationTypes: [] });
    const scene = buildScene(back, VIEW);
    expect(linesOf(scene)).toContain('api-reads-db');
    expect(scene).toEqual(buildSceneAfresh(back, VIEW));
  });

  it('is a view that does not show those relations, for search', () => {
    const project = leaving([{ relationType: 'systems.reads-from' }]);
    const view = project.views.find((each) => each.id === VIEW) as ViewFile;
    expect(viewShows(project, view, { kind: 'relation', id: 'api-reads-db' } as never)).toBe(false);
    expect(viewShows(project, view, { kind: 'relation', id: 'agent-to-api' } as never)).toBe(true);
    expect(viewShows(project, view, { kind: 'element', id: 'appointments-db' } as never)).toBe(
      true,
    );
  });
});
