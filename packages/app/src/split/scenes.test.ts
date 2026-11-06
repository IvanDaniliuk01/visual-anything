import { describe, expect, it } from 'vitest';
import { NOT_EXPANDED } from '../canvas/overlays/collapsed';
import { loadSample } from '../test/sample';
import { ViewScenes } from './scenes';

const project = loadSample();
const view = project.views[0]!;

describe('the scenes the panes of a split view share', () => {
  it('are one for each view and what it is drawn from', () => {
    const scenes = new ViewScenes();
    const scene = scenes.scene(project, view.id, NOT_EXPANDED, 'en');
    expect(scenes.scene(project, view.id, NOT_EXPANDED, 'en')).toBe(scene);
    let made = 0;
    scenes.memo(`scene:${view.id}`, [project, NOT_EXPANDED, 'es'], () => made++);
    expect(made).toBe(1);
  });

  it('keep only what the panes draw', () => {
    const scenes = new ViewScenes();
    const scene = scenes.scene(project, view.id, NOT_EXPANDED, 'en');
    scenes.memo('in-place:gone', [], () => 1);
    scenes.places.set('gone', {
      view: 'gone',
      expanded: NOT_EXPANDED,
      from: [],
      places: new Map(),
    });
    expect(scenes.size).toBe(2);
    scenes.keep([view.id]);
    expect(scenes.size).toBe(1);
    expect(scenes.places.has('gone')).toBe(false);
    expect(scenes.scene(project, view.id, NOT_EXPANDED, 'en')).toBe(scene);
    scenes.keep([]);
    expect(scenes.size).toBe(0);
  });
});
