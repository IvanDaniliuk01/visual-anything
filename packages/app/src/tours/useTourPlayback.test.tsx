/** A tour's steps and reveals on the canvas, stage by stage, through the shell's playback (ADR 0077). */
import {
  TOUR_FADE_IN,
  TOUR_FADE_OUT,
  scenarioTimeline,
  type ViewState,
} from '@visual-anything/core';
import type { ScenarioFile, TourFile, TourStep } from '@visual-anything/schema';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Camera } from '../canvas/camera';
import type { FrameCapture } from '../canvas/capture';
import { buildScene } from '../canvas/scene';
import { EmphasisStore } from '../editor/emphasis';
import { ScenarioSession } from '../scenarios/session';
import { loadSample } from '../test/sample';
import type { GoTo } from '../view-state/applier';
import type { CanvasCamera } from '../view-state/canvas';
import type { ViewStateLink } from '../view-state/useViewState';
import { keysOfMarks } from './marks';
import { playedBounds } from './scenario-frame';
import { TOUR_EMPHASIS, useTourPlayback } from './useTourPlayback';

const VIEW = 'system-overview';
const tour: TourFile = {
  id: 'stages',
  name: 'Stages',
  steps: [
    {
      id: 'one',
      viewState: { view: VIEW },
      caption: { title: 'One' },
      marks: ['booking-agent'],
    },
    {
      id: 'two',
      viewState: { view: VIEW },
      caption: { title: 'Two' },
      marks: ['booking-agent', 'agent-to-api'],
      dimRest: true,
      reveal: [{ marks: ['reminder-service'] }],
    },
  ],
};
const sample = loadSample();
const project = { ...sample, tours: [tour] };
const scene = buildScene(project, VIEW);
const keys = (...ids: string[]) => [...keysOfMarks(ids, scene, project)].sort();
const HERE: Camera = { x: 0, y: 0, scale: 1 };
const VIEWPORT = { width: 1200, height: 800 };

function setUp(options: { played?: TourFile; scenarios?: ScenarioSession; at?: Camera } = {}) {
  const played = options.played ?? tour;
  const shownProject = { ...sample, tours: [played] };
  const asked: GoTo[] = [];
  const viewState: ViewStateLink = {
    address: () => undefined,
    current: (): ViewState => ({ view: VIEW }),
    goTo: (request) => asked.push(request),
  };
  const captures: { fadeOut: ReturnType<typeof vi.fn>; drop: ReturnType<typeof vi.fn> }[] = [];
  // The canvas's camera, which the tour and the person move, telling who listens.
  let camera = options.at ?? HERE;
  const listeners = new Set<() => void>();
  const moveTo = (to: Camera) => {
    camera = to;
    for (const listener of listeners) listener();
  };
  const glideTo = vi.fn<CanvasCamera['glideTo']>(moveTo);
  const canvas: CanvasCamera = {
    camera: () => camera,
    viewport: () => VIEWPORT,
    setCamera: vi.fn(moveTo),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reveal: vi.fn(),
    targetOf: () => camera,
    glideTo,
    capture: () => {
      const capture = { hold: vi.fn(), fadeOut: vi.fn(), drop: vi.fn() };
      captures.push(capture);
      return capture as unknown as FrameCapture;
    },
  };
  const emphasis = new EmphasisStore();
  const scenarios = options.scenarios ?? new ScenarioSession();
  const hook = renderHook(() =>
    useTourPlayback({
      project: shownProject,
      scene,
      viewState,
      scenarios,
      emphasis,
      canvas,
      reducedMotion: false,
    }),
  );
  /** The applier, once it has drawn the step: the camera stays where it is. */
  const arrive = () => {
    const request = asked.at(-1);
    if (request?.kind !== 'address' || !request.travel) throw new Error('No step on its way.');
    return request.travel.move(camera, camera, VIEWPORT, true);
  };
  const tourMarks = () => {
    const { highlighted, arriving, dimmed } = emphasis.get();
    return {
      highlighted: [...(highlighted ?? [])].sort(),
      arriving: [...(arriving?.keys ?? [])].sort(),
      dimmed: dimmed !== undefined,
    };
  };
  const pass = (ms: number) => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };
  /** Plays the tour from a step, once its first step has come and its transition is over. */
  const start = (at = 0) => {
    act(() => hook.result.current.host.play(played, at));
    pass(40);
    act(() => {
      arrive();
    });
    pass(TOUR_FADE_IN);
  };
  /** Comes to the step a press went to, and lets its transition end. */
  const land = () => {
    act(() => {
      arrive();
    });
    pass(TOUR_FADE_OUT + TOUR_FADE_IN);
  };
  return {
    ...hook,
    asked,
    captures,
    emphasis,
    arrive,
    tourMarks,
    pass,
    start,
    land,
    glideTo,
    moveTo,
    project: shownProject,
  };
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'performance',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTourPlayback’s stages', () => {
  it('brings a step’s marks in after its out stage, keeping those the step before marked', () => {
    const { result, asked, captures, arrive, tourMarks, pass } = setUp();
    act(() => result.current.host.play(tour));
    // The first step waits for the canvas to fill the window, then goes, and its marks come in.
    pass(40);
    expect(asked).toHaveLength(1);
    act(() => {
      arrive();
    });
    expect(tourMarks()).toEqual({
      highlighted: keys('booking-agent'),
      arriving: keys('booking-agent'),
      dimmed: false,
    });
    pass(TOUR_FADE_IN);
    expect(tourMarks().arriving).toEqual([]);

    // The next step: the out stage fades under a capture, with only the marks both steps share.
    act(() => result.current.player.next());
    expect(captures).toHaveLength(1);
    expect(captures[0]?.fadeOut).toHaveBeenCalledWith(TOUR_FADE_OUT);
    expect(result.current.transition).toEqual(
      expect.objectContaining({ caption: 0, phase: 'out' }),
    );
    expect(tourMarks()).toEqual({
      highlighted: keys('booking-agent'),
      arriving: [],
      dimmed: true,
    });
    // The two steps share their view state: the camera stays, and the rest comes in.
    act(() => {
      expect(arrive()).toEqual({ duration: 0 });
    });
    pass(TOUR_FADE_OUT);
    expect(result.current.transition).toEqual(expect.objectContaining({ caption: 1, phase: 'in' }));
    expect(tourMarks().highlighted).toEqual(keys('booking-agent', 'agent-to-api'));
    expect(tourMarks().arriving).toEqual(
      keys('booking-agent', 'agent-to-api').filter((key) => !keys('booking-agent').includes(key)),
    );
    pass(TOUR_FADE_IN);
    expect(result.current.transition.phase).toBe('shown');
  });

  it('brings a reveal in one press at a time, and takes it away one press back', () => {
    const { result, captures, arrive, emphasis, tourMarks, pass } = setUp();
    act(() => result.current.host.play(tour, 1));
    pass(40);
    act(() => {
      arrive();
    });
    pass(TOUR_FADE_IN);
    const dimmedBefore = emphasis.get().dimmed;
    expect(dimmedBefore?.has(keys('reminder-service')[0] as string)).toBe(true);

    act(() => result.current.player.next());
    expect(result.current.playback).toEqual(expect.objectContaining({ step: 1, reveal: 1 }));
    // Its dimming changes under a capture; its marks fade in, the rest as they were.
    expect(captures.at(-1)?.fadeOut).toHaveBeenCalledWith(TOUR_FADE_IN);
    expect(tourMarks().arriving).toEqual(keys('reminder-service'));
    expect(emphasis.get().dimmed?.has(keys('reminder-service')[0] as string)).toBe(false);
    pass(TOUR_FADE_IN);
    expect(tourMarks().arriving).toEqual([]);

    act(() => result.current.player.previous());
    expect(result.current.playback.reveal).toBe(0);
    expect(captures.at(-1)?.fadeOut).toHaveBeenCalledWith(TOUR_FADE_OUT);
    expect(tourMarks().highlighted).toEqual(keys('booking-agent', 'agent-to-api'));
  });

  it('finishes a transition at once when pressed during it, and lets everything go at the end', () => {
    const { result, captures, arrive, emphasis, pass } = setUp();
    act(() => result.current.host.play(tour));
    pass(40);
    act(() => {
      arrive();
    });
    act(() => result.current.player.next());
    // Pressed again during the out stage: it finishes, and the reveal starts.
    act(() => result.current.player.next());
    expect(captures[0]?.drop).toHaveBeenCalled();
    expect(result.current.transition).toEqual(
      expect.objectContaining({ caption: 1, phase: 'shown' }),
    );
    act(() => result.current.player.end());
    expect(emphasis.get()).toEqual({});
    expect(result.current.transition.target).toBeUndefined();
  });
});

describe('useTourPlayback’s emphasis', () => {
  it('sets nothing of a tour that is not playing', () => {
    const { emphasis } = setUp();
    expect(emphasis.get()).toEqual({});
    // The source is the tour's.
    expect(TOUR_EMPHASIS).toBe('tour');
  });
});

// ADR 0077: the stage around the steps.
describe('useTourPlayback’s stage', () => {
  const scenario = sample.scenarios[0] as ScenarioFile;
  const plays: TourFile = {
    id: 'plays',
    name: 'Plays',
    steps: [
      {
        id: 'plays',
        viewState: { view: VIEW },
        caption: { title: 'Plays' },
        play: { scenario: scenario.id, from: 'ask', to: 'find-slots' },
      },
      { id: 'after', viewState: { view: VIEW }, caption: { title: 'After' } },
    ],
  };
  const timed: TourFile = {
    ...tour,
    steps: [{ ...(tour.steps[0] as TourStep), advance: 1000 }, ...tour.steps.slice(1)],
  };

  /** A scenario session over the sample's scenario, which opens as the step's view state would. */
  function sessionOf() {
    const session = new ScenarioSession();
    const context = {
      project: sample,
      viewId: VIEW,
      send: undefined,
      timeline: scenarioTimeline(sample, scenario),
      announce: () => {},
    };
    session.sync(context);
    const open = () =>
      act(() => {
        session.open(scenario.id);
        session.sync(context);
      });
    return { session, open };
  }

  it('tells screen readers of what the person brings in, and of nothing that comes on a timer', () => {
    const { result, pass, land } = setUp({ played: timed });
    act(() => result.current.host.play(timed));
    expect(result.current.stage.said).toBeUndefined();
    pass(40);
    expect(result.current.stage.said).toMatchObject({ kind: 'step', step: 0, count: 1 });
    land();
    // The step advances by itself: what it comes to is not announced.
    pass(1000);
    expect(result.current.playback.step).toBe(1);
    expect(result.current.stage.said).toMatchObject({ step: 0, count: 1 });
    land();
    act(() => result.current.act('next'));
    expect(result.current.stage.said).toMatchObject({ kind: 'reveal', reveal: 1, count: 2 });
    act(() => result.current.act('previous'));
    act(() => result.current.act('previous'));
    expect(result.current.stage.said).toMatchObject({ kind: 'step', step: 0, count: 3 });
  });

  it('advances by itself once its transition is over, and waits while the person pauses it', () => {
    const { result, pass, start } = setUp({ played: timed });
    start();
    expect(result.current.stage.advancing).toEqual({ paused: false });
    pass(500);
    act(() => result.current.act('pause'));
    expect(result.current.stage.advancing).toEqual({ paused: true });
    pass(5000);
    expect(result.current.playback.step).toBe(0);
    act(() => result.current.act('pause'));
    pass(499);
    expect(result.current.playback.step).toBe(0);
    pass(1);
    expect(result.current.playback.step).toBe(1);
    // The last step has nothing to advance to.
    expect(result.current.stage.advancing).toBeUndefined();
  });

  it('pauses advancing from the stage’s control on a step that plays a scenario, which plays on', () => {
    const { session, open } = sessionOf();
    const timedPlay: TourFile = {
      ...plays,
      steps: [{ ...(plays.steps[0] as TourStep), advance: 60_000 }, ...plays.steps.slice(1)],
    };
    const { result, start } = setUp({ played: timedPlay, scenarios: session });
    start();
    open();
    act(() => result.current.act('hold'));
    expect(result.current.stage.advancing).toEqual({ paused: true });
    expect(session.getState().mode).toBe('playing');
    // P pauses the scenario itself.
    act(() => result.current.act('pause'));
    expect(session.getState().mode).toBe('paused');
    expect(result.current.stage.advancing).toEqual({ paused: true });
  });

  it('waits while the steps’ index is open, and jumps from it to a step’s start', () => {
    const { result, pass, start } = setUp({ played: timed });
    start();
    act(() => result.current.act('index'));
    expect(result.current.stage.index).toBe(true);
    pass(3000);
    expect(result.current.playback.step).toBe(0);
    act(() => result.current.goTo(1));
    expect(result.current.stage.index).toBe(false);
    expect(result.current.playback).toMatchObject({ step: 1, reveal: 0 });
    expect(result.current.stage.said).toMatchObject({ kind: 'step', step: 1 });
  });

  it('frames everything a step without a camera plays, and plays its range', () => {
    const { session, open } = sessionOf();
    const { result, asked, start } = setUp({ played: plays, scenarios: session });
    start();
    const request = asked[0];
    if (request?.kind !== 'address') throw new Error('No step on its way.');
    expect(request.state).toMatchObject({ scenario: scenario.id });
    expect(request.travel?.frame?.(scene)).toEqual(playedBounds(sample, scene, scenario, 0, 2));
    expect(result.current.stage.scenario).toEqual({
      scenario: scenario.id,
      step: 0,
      state: 'playing',
    });
    open();
    expect(session.getState().mode).toBe('playing');
  });

  it('pauses a step’s scenario from the card, keeping its range, and plays it again', () => {
    const { session, open } = sessionOf();
    const { result, start } = setUp({ played: plays, scenarios: session });
    start();
    open();
    act(() => result.current.act('pause'));
    expect(session.getState().mode).toBe('paused');
    expect(result.current.stage.scenario?.state).toBe('paused');
    expect(result.current.stage.said).toMatchObject({ kind: 'paused', scenario: scenario.id });
    act(() => result.current.act('pause'));
    expect(session.getState().mode).toBe('playing');
    expect(result.current.stage.scenario?.state).toBe('playing');
    // Past the range's last step, it goes back to it, plays its travel once, and is done.
    act(() => session.goToStep(3));
    expect(session.getState()).toMatchObject({ mode: 'stepping', step: 2 });
    expect(result.current.stage.scenario?.state).toBe('done');
    act(() => result.current.act('replay'));
    expect(session.getState()).toMatchObject({ mode: 'playing', step: 0 });
  });

  it('moves on once its scenario’s range ends, when it advances after its scenario', () => {
    const { session, open } = sessionOf();
    const after: TourFile = {
      ...plays,
      steps: [
        { ...(plays.steps[0] as TourStep), advance: 'after-scenario' },
        ...plays.steps.slice(1),
      ],
    };
    const { result, start } = setUp({ played: after, scenarios: session });
    start();
    open();
    expect(result.current.playback.step).toBe(0);
    act(() => session.goToStep(3));
    expect(result.current.playback.step).toBe(1);
  });

  it('brings the scenario’s steps outside a step’s camera into view, and moves nothing in a step without one', () => {
    const away: Camera = { x: -20_000, y: -20_000, scale: 1 };
    const withCamera: TourFile = {
      ...plays,
      steps: [
        {
          ...(plays.steps[0] as TourStep),
          viewState: { view: VIEW, camera: { x: 20_600, y: 20_400, zoom: 1 } },
        },
        ...plays.steps.slice(1),
      ],
    };
    const first = sessionOf();
    const followed = setUp({ played: withCamera, scenarios: first.session, at: away });
    followed.start();
    first.open();
    expect(followed.glideTo).toHaveBeenCalledTimes(1);
    const [to] = followed.glideTo.mock.calls[0] ?? [];
    expect(to?.scale).toBe(1);
    expect(to).not.toEqual(away);

    const second = sessionOf();
    const framed = setUp({ played: plays, scenarios: second.session, at: away });
    framed.start();
    second.open();
    expect(framed.glideTo).not.toHaveBeenCalled();
  });

  it('offers Back to the step once the person pans or zooms, and gives its camera back', () => {
    const { result, pass, start, moveTo, glideTo } = setUp();
    start();
    pass(100);
    expect(result.current.stage.looked).toBe(false);
    act(() => moveTo({ x: -400, y: 120, scale: 1.5 }));
    expect(result.current.stage.looked).toBe(true);
    act(() => result.current.act('back'));
    expect(glideTo).toHaveBeenLastCalledWith(HERE, expect.any(Number), expect.anything());
    expect(result.current.stage.looked).toBe(false);
  });

  it('puts the caption on the side of the screen farthest from the step’s marks', () => {
    const agent = scene.shapes.find((shape) => shape.element === 'booking-agent');
    if (!agent) throw new Error('The sample draws no booking agent.');
    const { rect } = agent;
    // The agent near the bottom of the screen: the card goes to the top.
    const at: Camera = {
      scale: 1,
      x: VIEWPORT.width / 2 - (rect.x + rect.width / 2),
      y: VIEWPORT.height - 40 - (rect.y + rect.height),
    };
    const { result, start } = setUp({ at });
    start();
    expect(result.current.stage.place).toBe('top');
  });
});
