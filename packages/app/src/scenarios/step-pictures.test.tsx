/**
 * The pictures a step shows (ADR 0098, stage 4): what the step a scenario or a tour shows now hides
 * of the view drawn, through an emphasis of its own, and the videos it asks every canvas to play,
 * none under reduced motion.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { FreeShape, Id, Picture, ScenarioFile, TourFile } from '@visual-anything/schema';
import { act, renderHook } from '@testing-library/react';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { emphasize } from '../canvas/emphasize';
import { onStepVideos } from '../canvas/pictures/playing';
import { buildScene } from '../canvas/scene';
import { EmphasisStore } from '../editor/emphasis';
import { STEP_PICTURES_EMPHASIS, stepPicturesNow, useStepPictures } from './step-pictures';

const ref = (hash: string, format: Picture['media']['format']) => ({
  hash: hash.repeat(64),
  format,
  width: 640,
  height: 360,
  bytes: 1000,
});
const photo: Picture = {
  kind: 'picture',
  id: 'photo',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  media: ref('a', 'jpeg'),
};
const video: Picture = { ...photo, id: 'video', media: ref('b', 'mp4') };
const card: FreeShape = {
  kind: 'link',
  id: 'card',
  x: 0,
  y: 0,
  width: 320,
  height: 112,
  url: 'https://example.com/',
  title: 'Example',
};

const scenario: ScenarioFile = {
  id: 'walk',
  name: 'A walk',
  view: 'board',
  steps: [
    { id: 'one', description: 'One.', relations: ['r'], shows: ['photo'] },
    { id: 'two', description: 'Two.', relations: ['r'], shows: ['video'], playing: ['video'] },
    { id: 'three', description: 'Three.', relations: ['r'] },
  ],
};
const tour: TourFile = {
  id: 'tour',
  name: 'A tour',
  steps: [
    { id: 'a', viewState: { view: 'board' }, caption: { title: 'A' }, shows: ['card'] },
    { id: 'b', viewState: { view: 'other' }, caption: { title: 'B' } },
  ],
};

function project(changes: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Pictures', packages: [] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [],
      relations: [],
    },
    packages: [],
    views: [
      {
        id: 'board',
        name: 'Board',
        perspective: { name: 'Board' },
        nestingRelationTypes: [],
        positions: [],
        freeShapes: [
          { kind: 'note', id: 'note', x: 0, y: 0, width: 1, height: 1, text: 'Hi' },
          photo,
          video,
          card,
        ],
      },
      {
        id: 'other',
        name: 'Other',
        perspective: { name: 'Other' },
        nestingRelationTypes: [],
        positions: [],
        freeShapes: [],
      },
    ],
    scenarios: [scenario],
    tours: [tour],
    comments: [],
    ...changes,
  };
}

const hidden = (shown: ReturnType<typeof stepPicturesNow>) => [...(shown?.hidden ?? [])].sort();

describe('stepPicturesNow', () => {
  it('hides what the scenario’s step does not show, a note never, and plays its videos', () => {
    const at = (step: number) =>
      stepPicturesNow(project(), 'board', { scenario: { id: 'walk', step } });
    expect(hidden(at(0))).toEqual(['card', 'video']);
    expect(at(1)?.playing).toEqual(['video']);
    expect(hidden(at(2))).toEqual(['card', 'photo', 'video']);
  });

  it('shows everything when nothing chooses, or over another view', () => {
    const plain = project({
      scenarios: [{ ...scenario, steps: [{ id: 'one', description: '', relations: ['r'] }] }],
    });
    expect(stepPicturesNow(plain, 'board', { scenario: { id: 'walk', step: 0 } })).toBeUndefined();
    expect(
      stepPicturesNow(project(), 'other', { scenario: { id: 'walk', step: 0 } }),
    ).toBeUndefined();
    expect(stepPicturesNow(project(), 'board', {})).toBeUndefined();
  });

  it('lets a tour that chooses decide, and the scenario when it does not', () => {
    const both = { tour: { id: 'tour', step: 0 }, scenario: { id: 'walk', step: 1 } };
    expect(hidden(stepPicturesNow(project(), 'board', both))).toEqual(['photo', 'video']);
    const plainTour = project({
      tours: [
        { ...tour, steps: [{ id: 'a', viewState: { view: 'board' }, caption: { title: 'A' } }] },
      ],
    });
    expect(stepPicturesNow(plainTour, 'board', both)?.playing).toEqual(['video']);
  });
});

describe('an emphasis that hides pictures', () => {
  it('hides pictures, videos and link cards as it hides notes, and dims them too', () => {
    const scene = buildScene(project(), 'board');
    const done = emphasize(scene, {
      hidden: new Set(['photo', 'card']),
      dimmed: new Set(['video']),
    });
    expect([...done.hidden.free].sort()).toEqual(['card', 'photo']);
    expect([...done.dimmed.free]).toEqual(['video']);
  });
});

describe('useStepPictures', () => {
  const asked: Id[][] = [];
  const stop = onStepVideos((ids) => asked.push([...ids]));
  afterEach(() => {
    asked.length = 0;
  });
  afterAll(stop);

  function session(step: number) {
    let state = { scenario: 'walk' as Id | undefined, step, choices: {} };
    const listeners = new Set<() => void>();
    return {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getState: () => state,
      go: (to: number) => {
        state = { ...state, step: to };
        for (const listener of listeners) listener();
      },
    };
  }

  it('hides through its own emphasis and asks for the step’s videos, until it goes', () => {
    const emphasis = new EmphasisStore();
    const scenarios = session(0);
    const { unmount } = renderHook(() =>
      useStepPictures({
        project: project(),
        viewId: 'board',
        tour: { tour: undefined, step: 0 },
        scenarios,
        emphasis,
        reducedMotion: false,
      }),
    );
    expect([...(emphasis.get().hidden ?? [])].sort()).toEqual(['card', 'video']);
    act(() => scenarios.go(1));
    expect([...(emphasis.get().hidden ?? [])].sort()).toEqual(['card', 'photo']);
    expect(asked.at(-1)).toEqual(['video']);
    act(() => scenarios.go(0));
    expect(asked.at(-1)).toEqual([]);
    unmount();
    expect(emphasis.get().hidden).toBeUndefined();
    expect(STEP_PICTURES_EMPHASIS).toBe('step-pictures');
  });

  it('starts no video under reduced motion', () => {
    const emphasis = new EmphasisStore();
    const { unmount } = renderHook(() =>
      useStepPictures({
        project: project(),
        viewId: 'board',
        tour: { tour: undefined, step: 0 },
        scenarios: session(1),
        emphasis,
        reducedMotion: true,
      }),
    );
    expect([...(emphasis.get().hidden ?? [])].sort()).toEqual(['card', 'photo']);
    expect(asked.flat()).toEqual([]);
    unmount();
  });
});
