/**
 * The colors the scene gives each shape and line for the dark canvas (ADR-0033): built-in colors in
 * their dark shades, stored colors as stored, and nothing at all where both themes draw the same.
 */
import { DARK_SHADES, executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { buildScene, buildSceneAfresh, type ElementShape, type RelationLine } from './scene';

const VIEW = 'system-overview';

function shapeOf(project: ProjectSnapshot, element: string): ElementShape {
  const shape = buildScene(project, VIEW).shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape for ${element}`);
  return shape;
}

function lineOf(project: ProjectSnapshot, relation: string): RelationLine {
  const line = buildScene(project, VIEW).relations.find((each) => each.relation === relation);
  if (!line) throw new Error(`No line for ${relation}`);
  return line;
}

function applied(project: ProjectSnapshot, command: Parameters<typeof executeCommand>[1]) {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

describe('the dark canvas’s colors in the scene', () => {
  const sample = loadSample();

  it('gives a shape in built-in colors their dark shades, and keeps the light ones', () => {
    const shape = shapeOf(sample, 'scheduling');
    expect([shape.fill, shape.stroke]).toEqual(['#F3F5F8', '#5B6675']);
    expect(shape.dark).toEqual(DARK_SHADES.components['systems.system']);
  });

  it('draws a stored fill as stored, beside the dark shade of a built-in stroke', () => {
    const agent = shapeOf(sample, 'booking-agent');
    expect(agent.fill).toBe('#F8E1EC');
    expect(agent.dark).toEqual({
      fill: '#F8E1EC',
      stroke: DARK_SHADES.components['systems.ai-agent']?.stroke,
    });
  });

  it('gives no dark colors to a shape drawn only in stored colors', () => {
    const project = applied(sample, {
      type: 'update-element',
      id: 'scheduling',
      changes: { appearance: { fill: '#FFE8D6', stroke: '#8A4B12' } },
    });
    const shape = shapeOf(project, 'scheduling');
    expect([shape.fill, shape.stroke]).toEqual(['#FFE8D6', '#8A4B12']);
    expect(shape.dark).toBeUndefined();
  });

  it('keeps a built-in fill light beside a stored stroke that the dark canvas would hide', () => {
    const project = applied(sample, {
      type: 'update-element',
      id: 'scheduling',
      changes: { appearance: { stroke: '#1D4F91' } },
    });
    // The pair the light theme shows, in both themes: nothing for the dark canvas of its own.
    const shape = shapeOf(project, 'scheduling');
    expect([shape.fill, shape.stroke]).toEqual(['#F3F5F8', '#1D4F91']);
    expect(shape.dark).toBeUndefined();
  });

  it('gives a relation of a built-in relation type its dark stroke', () => {
    const line = buildScene(sample, VIEW).relations[0] as RelationLine;
    expect(line.darkStroke).toBeDefined();
    expect(line.darkStroke).not.toBe(line.stroke);
  });

  it('follows a project appearance, in the light theme and the dark one alike', () => {
    const project = applied(sample, {
      type: 'set-component-appearance',
      component: 'systems.system',
      appearance: { fill: '#E7F5FF', stroke: '#0B7285' },
    });
    const shape = shapeOf(project, 'scheduling');
    expect([shape.fill, shape.stroke]).toEqual(['#E7F5FF', '#0B7285']);
    expect(shape.dark).toBeUndefined();
  });

  it('is built alike from nothing and from the build before', () => {
    const before = buildScene(sample, VIEW);
    const project = applied(sample, {
      type: 'update-element',
      id: 'booking-agent',
      changes: { appearance: { stroke: '#D6336C' } },
    });
    const kept = buildScene(project, VIEW);
    expect(kept).toEqual(buildSceneAfresh(project, VIEW));
    // Only the shape that changed is a new object.
    const changed = kept.shapes.filter((shape, at) => shape !== before.shapes[at]);
    expect(changed.map((shape) => shape.element)).toEqual(['booking-agent']);
    expect(changed[0]?.dark).toEqual({ fill: '#2A2247', stroke: '#D6336C' });
  });

  it('carries a relation’s own stroke into the dark theme as stored', () => {
    const first = buildScene(sample, VIEW).relations[0] as RelationLine;
    const project = applied(sample, {
      type: 'update-relation',
      id: first.relation,
      changes: { appearance: { stroke: '#C2255C' } },
    });
    // As stored in both themes: nothing for the dark canvas of its own.
    const line = lineOf(project, first.relation);
    expect(line.stroke).toBe('#C2255C');
    expect(line.darkStroke).toBeUndefined();
  });
});
