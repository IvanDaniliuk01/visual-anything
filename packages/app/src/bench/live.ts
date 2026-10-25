/**
 * The benchmark's phases for live values (ADR 0057), with `?live`: every element of the view gets a
 * live value of an attribute its detail shows, through a project appearance, and the values change
 * four times a second, as the app tells its readers at most, while the camera pans where details
 * show. Each change is drawn as the app draws it: the canvas's scene made again with the lookup's
 * values in details (`withLiveDetails`), indexed, and handed to the canvas. A second phase times one
 * such change of every value at once, from the lookup to the frame drawn.
 *
 * The values are made here, as the local program would send them, so that only what the app does
 * with them is measured. Expected on the reference laptop: the pan within the frame budget, and a
 * change of 10,000 values within 50 ms, like one edit.
 */
import { definitionsIn, type LiveValue, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Scene } from '../canvas/scene';
import { t } from '../i18n';
import type { LiveView } from '../live-values/book';
import { withLiveDetails } from '../live-values/details';
import { AttributeLookup } from '../live-values/lookup';

/** The attribute every element's detail shows, and its live values change. */
export const LIVE_ATTRIBUTE = 'latency';

/** How often the values change in the pan, in frames at 60 a second: four times a second. */
export const LIVE_EVERY_FRAMES = 15;

/** How long one change of every value may take, from the lookup to the frame drawn, at the 95th percentile. */
export const LIVE_MARK = 50;

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

/** A lookup with a live value for every element the scene draws, `round` saying which values. */
export function liveLookup(scene: Scene, round: number, now: number): AttributeLookup {
  const values = new Map<Id, Map<string, LiveValue>>();
  for (const shape of scene.shapes) {
    if (values.has(shape.element)) continue;
    values.set(
      shape.element,
      new Map([
        [
          LIVE_ATTRIBUTE,
          {
            target: shape.element,
            attribute: LIVE_ATTRIBUTE,
            value: (values.size * 7 + round * 13) % 500,
            sender: { kind: 'claude' },
            arrivedAt: now,
            freshFor: 60_000,
          },
        ],
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

/** The canvas's scene with the lookup's values in details, as the shell makes it. */
export function liveScene(project: ProjectSnapshot, scene: Scene, lookup: AttributeLookup): Scene {
  return withLiveDetails(scene, project, definitionsIn(project), lookup, t);
}
