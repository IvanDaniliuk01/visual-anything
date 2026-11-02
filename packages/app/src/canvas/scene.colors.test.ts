/**
 * The colors a scene carries for relations, notes and free arrows: a relation's line takes its own
 * appearance over its relation type's, and the project appearance given to a built-in relation type;
 * an aggregated relation takes its relation type's; notes and arrows carry the colors of their own.
 * Colors are carried as stored (ADR-0033).
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { FreeShape, Relation, RelationType } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { THEMES } from '../theme/themes';
import { BASE_DRAWING } from './drawing';
import { buildScene, buildSceneAfresh, type RelationLine, type Scene } from './scene';

const sample = loadSample();
const VIEW = 'system-overview';

function lineOf(scene: Scene, relation: string): RelationLine {
  const line = scene.relations.find((candidate) => candidate.relation === relation);
  if (!line) throw new Error(`The scene draws no relation ${relation}.`);
  return line;
}

function apply(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

function withRelation(project: ProjectSnapshot, id: string, change: (r: Relation) => Relation) {
  return {
    ...project,
    model: {
      ...project.model,
      relations: project.model.relations.map((each) => (each.id === id ? change(each) : each)),
    },
  };
}

describe('the scene’s relation lines', () => {
  it('take a relation’s own appearance, and its relation type’s for the rest', () => {
    const project = withRelation(sample, 'api-reads-db', (relation) => ({
      ...relation,
      appearance: { stroke: '#D6336C', width: 4 },
    }));
    const scene = buildScene(project, VIEW);
    expect(lineOf(scene, 'api-reads-db')).toMatchObject({
      stroke: '#D6336C',
      width: 4,
      dash: 'dashed',
    });
    // The rest of a built-in type's look is Clean's: neutral, at its width (ADR 0086).
    expect(lineOf(scene, 'api-writes-db')).toMatchObject({
      stroke: THEMES.light.canvas.neutralLine,
      typeStroke: { light: '#3D4651' },
      width: BASE_DRAWING.lines.width,
    });
    expect(scene).toEqual(buildSceneAfresh(project, VIEW));
  });

  it('carry a stored color as it is stored', () => {
    const project = withRelation(sample, 'api-reads-db', (relation) => ({
      ...relation,
      appearance: { stroke: '#d6336c' },
    }));
    expect(lineOf(buildScene(project, VIEW), 'api-reads-db').stroke).toBe('#d6336c');
  });

  it('take the project appearance given to a built-in relation type', () => {
    const relationType = sample.model.relations.find((each) => each.id === 'api-reads-db')
      ?.relationType as string;
    const project = apply(sample, {
      type: 'set-relation-type-appearance',
      relationType,
      appearanceTraits: { stroke: '#1D4F91' },
    });
    const scene = buildScene(project, VIEW);
    for (const line of scene.relations) {
      const of = project.model.relations.find((each) => each.id === line.relation);
      if (of?.relationType === relationType) expect(line.stroke).toBe('#1D4F91');
    }
    expect(lineOf(scene, 'api-reads-db').stroke).toBe('#1D4F91');
  });

  it('show a project appearance given after the view was drawn, and its removal', () => {
    const first = buildScene(sample, VIEW);
    const service = sample.model.elements.find((each) => each.id === 'appointments-api');
    const component = service?.component as string;
    const recolored = apply(sample, {
      type: 'set-component-appearance',
      component,
      appearanceTraits: { fill: '#FFE3E3' },
    });
    const relationType = sample.model.relations.find((each) => each.id === 'api-reads-db')
      ?.relationType as string;
    const both = apply(recolored, {
      type: 'set-relation-type-appearance',
      relationType,
      appearanceTraits: { stroke: '#1D4F91' },
    });
    const scene = buildScene(both, VIEW);
    expect(scene.shapes.find((shape) => shape.element === 'appointments-api')?.fill).toBe(
      '#FFE3E3',
    );
    expect(lineOf(scene, 'api-reads-db').stroke).toBe('#1D4F91');
    expect(scene).toEqual(buildSceneAfresh(both, VIEW));
    expect(buildScene(sample, VIEW)).toEqual(first);
    expect(lineOf(buildScene(sample, VIEW), 'api-reads-db').typeStroke?.light).toBe('#3D4651');
  });

  it('make again only the line of the relation whose appearance changed', () => {
    const first = buildScene(sample, VIEW);
    const project = apply(sample, {
      type: 'update-relation',
      id: 'api-reads-db',
      changes: { appearanceTraits: { stroke: '#D6336C' } },
    });
    const scene = buildScene(project, VIEW);
    const changed = scene.relations.filter((line, at) => line !== first.relations[at]);
    expect(changed.map((line) => line.relation)).toEqual(['api-reads-db']);
    expect(changed[0]?.route).toEqual(lineOf(first, 'api-reads-db').route);
    expect(scene.shapes).toBe(first.shapes);
    expect(scene).toEqual(buildSceneAfresh(project, VIEW));
  });

  it('draw an aggregated relation in its relation type’s appearance, whatever its relations’ own', () => {
    const calls: RelationType = {
      id: 'p.calls',
      name: 'calls',
      derivesFrom: 'relates-to',
      direction: 'directed',
      appearance: { stroke: '#3D4651', width: 2, dash: 'solid' },
    };
    const isIn: RelationType = {
      id: 'p.in',
      name: 'is in',
      derivesFrom: 'relates-to',
      nests: true,
    };
    const project: ProjectSnapshot = {
      project: { schemaVersion: 1, name: 'Fixture', packages: ['p'] },
      model: {
        world: { id: 'world', component: 'essence', name: 'World' },
        elements: [
          { id: 'box', component: 'essence', name: 'Box' },
          { id: 'a', component: 'essence', name: 'A' },
          { id: 'b', component: 'essence', name: 'B' },
          { id: 'far', component: 'essence', name: 'Far' },
        ],
        relations: [
          { id: 'a-in', relationType: 'p.in', from: 'a', to: 'box' },
          { id: 'b-in', relationType: 'p.in', from: 'b', to: 'box' },
          {
            id: 'a-far',
            relationType: 'p.calls',
            from: 'a',
            to: 'far',
            appearance: { stroke: '#D6336C', width: 5 },
          },
          { id: 'b-far', relationType: 'p.calls', from: 'b', to: 'far' },
        ],
      },
      packages: [{ id: 'p', name: 'P', components: [], relationTypes: [calls, isIn] }],
      views: [
        {
          id: 'v',
          name: 'V',
          perspective: { name: 'Any' },
          nestingRelationTypes: ['p.in'],
          positions: [],
          freeShapes: [],
          collapsed: ['box'],
        },
      ],
      scenarios: [],
      tours: [],
      comments: [],
    };
    const scene = buildScene(project, 'v');
    const aggregated = scene.relations.find((line) => line.aggregate !== undefined);
    expect(aggregated?.aggregate?.relations).toEqual(['a-far', 'b-far']);
    expect(aggregated?.stroke).toBe('#3D4651');
    expect(aggregated?.dash).toBe('solid');
    // Clean's count badge keeps its type's width; Expressive's grows with its count.
    expect(aggregated?.width).toBe(2);
    const growing = buildScene(
      { ...project, project: { ...project.project, drawing: { preset: 'expressive' } } },
      'v',
    ).relations.find((line) => line.aggregate !== undefined);
    expect(growing?.width).toBeGreaterThan(2);
    expect(growing?.width).toBeLessThan(5 + 2);
  });
});

describe('the scene’s notes and arrows', () => {
  const shapes: FreeShape[] = [
    {
      kind: 'note',
      id: 'warned',
      x: 0,
      y: 0,
      width: 200,
      height: 60,
      text: 'Careful',
      fill: '#FFE3E3',
      stroke: '#C92A2A',
    },
    { kind: 'note', id: 'plain', x: 0, y: 100, width: 200, height: 60, text: 'Plain' },
    { kind: 'arrow', id: 'pointer', from: { x: 0, y: 0 }, to: { x: 80, y: 0 }, stroke: '#c92a2a' },
    { kind: 'arrow', id: 'bare', from: { x: 0, y: 10 }, to: { x: 80, y: 10 } },
  ];
  const project: ProjectSnapshot = {
    ...sample,
    views: sample.views.map((view) => (view.id === VIEW ? { ...view, freeShapes: shapes } : view)),
  };
  const scene = buildScene(project, VIEW);

  it('carry a note’s own fill and stroke, and none for a note without them', () => {
    expect(scene.notes.find((note) => note.id === 'warned')).toMatchObject({
      fill: '#FFE3E3',
      stroke: '#C92A2A',
    });
    const plain = scene.notes.find((note) => note.id === 'plain');
    expect(plain).toBeDefined();
    expect(plain && 'fill' in plain).toBe(false);
    expect(plain && 'stroke' in plain).toBe(false);
  });

  it('carry an arrow’s own stroke as stored, and none for an arrow without one', () => {
    expect(scene.arrows.find((arrow) => arrow.id === 'pointer')?.stroke).toBe('#c92a2a');
    const bare = scene.arrows.find((arrow) => arrow.id === 'bare');
    expect(bare && 'stroke' in bare).toBe(false);
  });

  it('carry a color changed by a command', () => {
    const changed = apply(project, {
      type: 'update-free-shape',
      view: VIEW,
      shape: { ...(shapes[1] as FreeShape), fill: '#E7F5FF' } as FreeShape,
    });
    const after = buildScene(changed, VIEW);
    expect(after.notes.find((note) => note.id === 'plain')?.fill).toBe('#E7F5FF');
    expect(after).toEqual(buildSceneAfresh(changed, VIEW));
  });
});
