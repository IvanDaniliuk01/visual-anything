import { modelIndexOf, type PlayableStep, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene, shownBy } from '../canvas/scene';
import { loadSample } from '../test/sample';
import { dimRestOf, keysOfMarks, shownMarks } from './marks';

const sample = loadSample();
const VIEW = 'system-overview';
const scene = buildScene(sample, VIEW);
const line = scene.relations.find((each) => !each.aggregate);
if (!line) throw new Error('The sample draws no relation.');
const relation = modelIndexOf(sample).relation(line.relation);
if (!relation) throw new Error('The line draws no relation.');

describe('shownMarks', () => {
  const playable: PlayableStep = {
    viewState: { view: VIEW },
    marks: ['a'],
    reveals: [{ marks: ['b', 'a'] }, { marks: ['c'], text: 'And c.' }],
  };

  it('is what the step marks, and what the reveals shown so far mark, each once', () => {
    expect(shownMarks(playable, 0)).toEqual(['a']);
    expect(shownMarks(playable, 1)).toEqual(['a', 'b']);
    expect(shownMarks(playable, 2)).toEqual(['a', 'b', 'c']);
    expect(shownMarks(playable, 9)).toEqual(['a', 'b', 'c']);
  });
});

describe('dimRestOf', () => {
  it('dims everything but what the step marks and the ends of the relations it marks', () => {
    const dimmed = dimRestOf([relation.id], scene, sample);
    const from = shownBy(scene, relation.from)?.key;
    const to = shownBy(scene, relation.to)?.key;
    expect(dimmed.has(line.relation)).toBe(false);
    expect(dimmed.has(from as string)).toBe(false);
    expect(dimmed.has(to as string)).toBe(false);
    const others = scene.shapes.filter((shape) => shape.key !== from && shape.key !== to);
    expect(others.length).toBeGreaterThan(0);
    for (const shape of others) {
      // A container that holds an end is drawn around it, and is the rest: dimmed.
      expect(dimmed.has(shape.key)).toBe(true);
    }
    for (const each of scene.relations) {
      if (each !== line) expect(dimmed.has(each.relation)).toBe(true);
    }
    for (const note of scene.notes) expect(dimmed.has(note.id)).toBe(true);
  });

  it('leaves the relations on a marked element dimmed, unlike focus', () => {
    const dimmed = dimRestOf([relation.from], scene, sample);
    expect(dimmed.has(shownBy(scene, relation.from)?.key as string)).toBe(false);
    expect(dimmed.has(line.relation)).toBe(true);
    expect(dimmed.has(shownBy(scene, relation.to)?.key as string)).toBe(true);
  });

  it('keeps at full strength the collapsed container that shows what it marks', () => {
    const view = sample.views.find((each) => each.id === VIEW);
    const project: ProjectSnapshot = {
      ...sample,
      views: sample.views.map((each) =>
        each === view ? { ...each, collapsed: ['scheduling'] } : each,
      ),
    };
    const collapsed = buildScene(project, VIEW);
    const holder = shownBy(collapsed, 'appointments-api');
    expect(holder?.key).toBe('clinic-booking/scheduling');
    expect(dimRestOf(['appointments-api'], collapsed, project).has(holder?.key as string)).toBe(
      false,
    );
  });
});

describe('keysOfMarks', () => {
  it('names what the canvas draws for the marks', () => {
    const keys = keysOfMarks([relation.id, relation.from], scene, sample);
    expect(keys.has(line.relation)).toBe(true);
    expect(keys.has(shownBy(scene, relation.from)?.key as string)).toBe(true);
  });
});
