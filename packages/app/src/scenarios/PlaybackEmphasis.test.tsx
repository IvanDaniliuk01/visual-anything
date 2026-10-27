import { TRAVEL_TIME, scenarioTimeline, type Timeline } from '@visual-anything/core';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildScene } from '../canvas/scene';
import { EmphasisContext, EmphasisStore } from '../editor/emphasis';
import { loadSample } from '../test/sample';
import { PlaybackEmphasis } from './PlaybackEmphasis';
import { ScenarioSession, type Clock } from './session';

const sample = loadSample();
const view = sample.views[0]!;
const scene = buildScene(sample, view.id);
const scenario = sample.scenarios[0]!;
const timeline = scenarioTimeline(sample, scenario);

function setUp() {
  let now = 0;
  let waiting: (() => void) | undefined;
  const clock: Clock = {
    now: () => now,
    request: (callback) => {
      waiting = callback;
      return 1;
    },
    cancel: () => {
      waiting = undefined;
    },
  };
  const session = new ScenarioSession(clock);
  const store = new EmphasisStore();
  session.open(scenario.id);
  session.sync({ project: sample, viewId: view.id, send: undefined, timeline, announce: () => {} });
  const shown = (playing: Timeline | undefined) => (
    <EmphasisContext.Provider value={store}>
      <PlaybackEmphasis
        session={session}
        project={sample}
        view={playing ? view : undefined}
        scene={scene}
        timeline={playing}
      />
    </EmphasisContext.Provider>
  );
  const { rerender } = render(shown(timeline));
  return {
    session,
    store,
    show: (playing: Timeline | undefined) => rerender(shown(playing)),
    pass: (ms: number) => {
      act(() => {
        for (let left = ms; left > 0 && waiting; left -= 16) {
          now += Math.min(16, left);
          const frame = waiting;
          waiting = undefined;
          frame();
        }
      });
    },
  };
}

/** Answers the reduced motion query as the system would. */
function reducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: reduce && query.includes('reduce'),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PlaybackEmphasis', () => {
  it('highlights the step playback is on, with a marker at the start of its relation', () => {
    const { store } = setUp();
    expect([...(store.get().highlighted ?? [])].sort()).toEqual([
      'clinic-booking/whatsapp',
      'patient',
      'patient-to-whatsapp',
    ]);
    expect(store.get().markers).toEqual([{ relation: 'patient-to-whatsapp', progress: 0 }]);
  });

  it('moves the marker along while the step plays, and goes on to the next step', () => {
    const { session, store, pass } = setUp();
    act(() => session.play());
    pass(TRAVEL_TIME / 2);
    const [marker] = store.get().markers ?? [];
    expect(marker?.progress).toBeGreaterThan(0.3);
    expect(marker?.progress).toBeLessThan(0.7);
    pass(TRAVEL_TIME * 2);
    expect(store.get().markers?.[0]?.relation).toBe('whatsapp-to-agent');
    expect(store.get().highlighted).toContain('clinic-booking/booking-agent');
  });

  it('keeps the marker still at the end it travels to when the system asks for reduced motion', () => {
    reducedMotion(true);
    const { session, store, pass } = setUp();
    expect(store.get().markers).toEqual([{ relation: 'patient-to-whatsapp', progress: 1 }]);
    act(() => session.play());
    pass(TRAVEL_TIME / 3);
    expect(store.get().markers).toEqual([{ relation: 'patient-to-whatsapp', progress: 1 }]);
    expect(session.getState().mode).toBe('playing');
  });

  it('leaves a trail behind a marker while it travels, from where it was a moment before', () => {
    const { session, store, pass } = setUp();
    act(() => session.play());
    pass(TRAVEL_TIME / 2);
    const [marker] = store.get().markers ?? [];
    expect(marker?.trail).toBeGreaterThan(0);
    expect(marker?.trail).toBeLessThan(marker?.progress ?? 0);
    // Paused, it stands still: no trail.
    act(() => session.pause());
    expect(store.get().markers?.[0]?.trail).toBeUndefined();
  });

  it('leaves no trail where it stands still under reduced motion', () => {
    reducedMotion(true);
    const { session, store, pass } = setUp();
    act(() => session.play());
    pass(TRAVEL_TIME / 3);
    expect(store.get().markers?.[0]?.trail).toBeUndefined();
  });

  it('emphasizes nothing once nothing plays over the open view', () => {
    const { store, show } = setUp();
    show(undefined);
    expect(store.get()).toEqual({});
  });
});
