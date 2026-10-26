/**
 * The benchmark's phases for live values (ADR 0057), with `?live`: every element of the view gets a
 * live value of an attribute its detail shows, through a project appearance, and the values change
 * four times a second, as the app tells its readers at most, while the camera pans where details
 * show. Each change is drawn as the app draws it: the canvas's scene made again with the lookup's
 * values in details and overlays (`liveSceneOf`), indexed, and handed to the canvas. A second phase
 * times one such change of every value at once, from the lookup to the frame drawn.
 *
 * A third phase colors every shape by its live value through an overlay (ADR 0055), and times live
 * updates in which 1,000 of the values change, the others coming again as they were, as the program
 * sends them: from the lookup to the frame drawn, each must stay within one frame at 60 a second,
 * since it comes four times a second whatever else the canvas does (CLAUDE.md's budget).
 *
 * The values are made here, as the local program would send them, so that only what the app does
 * with them is measured. Expected on the reference laptop: the pan within the frame budget, a change
 * of 10,000 values within 50 ms, like one edit, and a change of 1,000 under an overlay within 16 ms.
 */
import { definitionsIn, type LiveValue, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, Overlay } from '@visual-anything/schema';
import type { Scene } from '../canvas/scene';
import { t } from '../i18n';
import { LIVE_NOTICE_MS, LiveValueBook, type LiveView } from '../live-values/book';
import { liveSceneOf } from '../live-values/details';
import { AttributeLookup } from '../live-values/lookup';

/** The attribute every element's detail shows, and its live values change. */
export const LIVE_ATTRIBUTE = 'latency';

/** How often the values change in the pan, in frames at 60 a second: four times a second. */
export const LIVE_EVERY_FRAMES = 15;

/** How long one change of every value may take, from the lookup to the frame drawn, at the 95th percentile. */
export const LIVE_MARK = 50;

/** How many values change in one live update of the overlay phase. */
export const LIVE_CHANGED = 1000;

/**
 * How long a live update of `LIVE_CHANGED` values under an overlay may take, from the lookup to the
 * frame drawn, at the 95th percentile: one frame at 60 a second.
 */
export const LIVE_UPDATE_MARK = 16;

/** Colors every shape by its live latency, from green to red. */
export const LATENCY_FILL: Overlay = {
  id: 'latency-fill',
  name: 'Latency',
  of: 'elements',
  attribute: LIVE_ATTRIBUTE,
  channel: 'fill',
  mapping: {
    kind: 'continuous',
    stops: [
      { at: 0, color: '#DCFCE7', label: 'fast' },
      { at: 250, color: '#FEF08A' },
      { at: 500, color: '#FCA5A5', label: 'slow' },
    ],
  },
};

/** The project with every component's detail showing the live attribute, as a project appearance. */
export function withLiveDetail(project: ProjectSnapshot): ProjectSnapshot {
  const components = new Set(project.model.elements.map((element) => element.component));
  const appearances = Object.fromEntries(
    [...components].map((id) => [id, { detail: { attributes: [LIVE_ATTRIBUTE] } }]),
  );
  return {
    ...project,
    project: {
      ...project.project,
      appearances: { ...project.project.appearances, components: appearances },
    },
  };
}

/** The project with the view colored by the live attribute, as `set-overlays` would leave it. */
export function withLatencyOverlay(project: ProjectSnapshot, view: Id): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((each) =>
      each.id === view ? { ...each, overlays: [LATENCY_FILL] } : each,
    ),
  };
}

/** A live value as the program sends it. */
function liveValue(target: Id, value: number, now: number): LiveValue {
  return {
    target,
    attribute: LIVE_ATTRIBUTE,
    value,
    sender: { kind: 'claude' },
    arrivedAt: now,
    freshFor: 60_000,
  };
}

/** A lookup with a live value for every element the scene draws, `round` saying which values. */
export function liveLookup(scene: Scene, round: number, now: number): AttributeLookup {
  const values = new Map<Id, Map<string, LiveValue>>();
  for (const shape of scene.shapes) {
    if (values.has(shape.element)) continue;
    values.set(
      shape.element,
      new Map([
        [LIVE_ATTRIBUTE, liveValue(shape.element, (values.size * 7 + round * 13) % 500, now)],
      ]),
    );
  }
  const view: LiveView = {
    version: round + 1,
    now,
    of: (target) => values.get(target),
    targets: new Set(values.keys()),
    size: values.size,
  };
  return new AttributeLookup(view);
}

/**
 * The lookups of successive live updates, in each of which `changed` of the values of what the scene
 * draws change, a different block each time, as the app makes them: the values go into a live values
 * book, as the program's message does, and the lookup reads the view it publishes. Every element has
 * a value from the first.
 */
export function liveRounds(
  scene: Scene,
  changed: number,
): (round: number, now: number) => AttributeLookup {
  const targets = [...new Set(scene.shapes.map((shape) => shape.element))];
  let clockNow = 0;
  let due: (() => void) | undefined;
  // A clock the rounds move: what the book asks to do later, it does when the round publishes.
  const book = new LiveValueBook({
    now: () => clockNow,
    later: (task) => {
      due = task;
      return { cancel: () => (due = undefined) };
    },
  });
  let first = true;
  return (round, now) => {
    const values: LiveValue[] = [];
    if (first) {
      // Every value arrives first at once, as when the program sends what it keeps.
      for (const [at, target] of targets.entries()) {
        values.push(liveValue(target, (at * 7) % 500, now));
      }
      first = false;
    }
    const start = (round * changed) % Math.max(1, targets.length);
    for (let each = 0; each < Math.min(changed, targets.length); each++) {
      const at = (start + each) % targets.length;
      values.push(liveValue(targets[at] as Id, (at * 7 + round * 131) % 500, now));
    }
    clockNow = Math.max(clockNow + LIVE_NOTICE_MS, now);
    book.apply({ type: 'live/values', values, removed: [] });
    const publish = due;
    due = undefined;
    publish?.();
    return new AttributeLookup(book.current());
  };
}

/** The canvas's scene with the lookup's values in details and overlays, as the shell makes it. */
export function liveScene(project: ProjectSnapshot, scene: Scene, lookup: AttributeLookup): Scene {
  return liveSceneOf(scene, project, definitionsIn(project), lookup, t);
}
