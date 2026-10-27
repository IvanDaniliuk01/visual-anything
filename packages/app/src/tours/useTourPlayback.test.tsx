/** A tour's steps and reveals on the canvas, stage by stage, through the shell's playback (ADR 0077). */
import { TOUR_FADE_IN, TOUR_FADE_OUT, type ViewState } from '@visual-anything/core';
import type { TourFile } from '@visual-anything/schema';
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

function setUp() {
  const asked: GoTo[] = [];
  const viewState: ViewStateLink = {
    address: () => undefined,
    current: (): ViewState => ({ view: VIEW }),
    goTo: (request) => asked.push(request),
  };
  const captures: { fadeOut: ReturnType<typeof vi.fn>; drop: ReturnType<typeof vi.fn> }[] = [];
  const canvas: CanvasCamera = {
    camera: () => HERE,
    viewport: () => VIEWPORT,
    setCamera: vi.fn(),
    subscribe: () => () => {},
    reveal: vi.fn(),
    targetOf: () => HERE,
    glideTo: vi.fn(),
    capture: () => {
      const capture = { hold: vi.fn(), fadeOut: vi.fn(), drop: vi.fn() };
      captures.push(capture);
      return capture as unknown as FrameCapture;
    },
  };
  const emphasis = new EmphasisStore();
  const hook = renderHook(() =>
    useTourPlayback({
      project,
      scene,
      viewState,
      scenarios: new ScenarioSession(),
      emphasis,
      canvas,
      reducedMotion: false,
    }),
  );
  /** The applier, once it has drawn the step: the camera stays where it is. */
  const arrive = () => {
    const request = asked.at(-1);
    if (request?.kind !== 'address' || !request.travel) throw new Error('No step on its way.');
    return request.travel.move(HERE, HERE, VIEWPORT, true);
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
  return { ...hook, asked, captures, emphasis, arrive, tourMarks, pass };
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
