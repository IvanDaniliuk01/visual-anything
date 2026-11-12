/**
 * The stills the tab keeps of explorables (ADR 0107), for the SVG, the PDF and the read-only page: a
 * place that shows an explorable is drawn as the still the canvas took of it there, found by the key
 * the tab's stills are kept by (`stillKey`: the frame's inputs, the data the place gives, which holds
 * the theme, the language, the parameters and its size, and the bucket), the largest bucket kept
 * first; and as its card otherwise. Only for an explorable that may run as it is: one whose approval
 * was withdrawn, or the watchdog stopped, is drawn as its card, as the canvas draws it.
 *
 * The canvas takes its stills with each explorable's default parameters; a tour step's values are
 * given by `parameters` where an export draws a step, so that its still is the one taken with them.
 */
import {
  STILL_BUCKETS,
  cardRuns,
  encodeBase64,
  explorableCard,
  explorableData,
  stillKey,
  type ExplorableApproval,
  type ExplorableDataInput,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { ExplorableParameterValue, Id } from '@visual-anything/schema';
import { useMemo } from 'react';
import { buildScene, picturesOf } from '../canvas/scene';
import { useExplorableApprovals } from '../explorables/hooks';
import { useExplorableSession, type ExplorableSession } from '../explorables/session';
import { useExplorableStills, type ExplorableStills } from '../explorables/stills';
import { useT } from '../i18n';
import { useAttributeLookup } from '../live-values/context';
import type { PageExplorableStill } from '../viewer/data';
import type { ExplorableSpot, ExplorableStillPicture } from './svg';

/** What the stills an export draws are found from. */
export interface ExportStillsInput {
  project: ProjectSnapshot;
  stills: ExplorableStills | null | undefined;
  session: ExplorableSession | null | undefined;
  approvals: readonly ExplorableApproval[];
  language: 'en' | 'es';
  /** The computed, live and simulated values of an element, as the canvas reads them. */
  sources?: ExplorableDataInput['sources'];
  /** The values a tour step sets for an explorable, where an export draws a step. */
  parameters?: (explorable: Id) => Record<string, ExplorableParameterValue> | undefined;
}

/** The largest bucket first: an export draws the sharpest still the tab keeps. */
const LARGEST_FIRST = [...STILL_BUCKETS].reverse();

/** The still the tab keeps of a place that shows an explorable, if it keeps one. */
export function exportStillOf(
  input: ExportStillsInput,
): (spot: ExplorableSpot) => ExplorableStillPicture | undefined {
  return (spot) => {
    const { project, stills, session } = input;
    if (!stills) return undefined;
    const card = explorableCard(project, spot.explorable, {
      approvals: input.approvals,
      place: { kind: 'app', stopped: (hash) => session?.stopped(hash), runner: 'ready' },
    });
    if (!cardRuns(card) || card.hash === undefined) return undefined;
    const parameters = input.parameters?.(spot.explorable);
    const data = explorableData(project, {
      explorable: spot.explorable,
      ...(spot.element === undefined ? {} : { element: spot.element }),
      ...(parameters === undefined ? {} : { parameters }),
      theme: spot.theme,
      language: input.language,
      size: { width: spot.width, height: spot.height },
      ...(input.sources === undefined ? {} : { sources: input.sources }),
    });
    for (const bucket of LARGEST_FIRST) {
      const kept = stills.queue.result(stillKey(card.hash, data, bucket));
      if (kept?.ok) {
        return {
          format: 'png',
          data: encodeBase64(kept.png),
          width: kept.width,
          height: kept.height,
        };
      }
    }
    return undefined;
  };
}

/**
 * The stills a read-only page holds (ADR 0107): of every place its views show an explorable, in each
 * theme, those the tab keeps. The page draws each in its place, and the card elsewhere.
 */
export function pageStillsOf(
  project: ProjectSnapshot,
  stillOf: (spot: ExplorableSpot) => ExplorableStillPicture | undefined,
): PageExplorableStill[] {
  const held: PageExplorableStill[] = [];
  for (const view of project.views) {
    const scene = buildScene(project, view.id);
    const places = [
      ...scene.shapes.flatMap((shape) =>
        shape.explorable
          ? [
              {
                spot: shape.key,
                explorable: shape.explorable.id,
                element: shape.element,
                rect: shape.explorable.rect,
              },
            ]
          : [],
      ),
      ...picturesOf(scene).flatMap((picture) =>
        picture.explorable
          ? [
              {
                spot: picture.id,
                explorable: picture.explorable.id,
                element: picture.explorable.element,
                rect: picture.rect,
              },
            ]
          : [],
      ),
    ];
    for (const place of places) {
      for (const theme of ['light', 'dark'] as const) {
        const still = stillOf({
          spot: place.spot,
          explorable: place.explorable,
          ...(place.element === undefined ? {} : { element: place.element }),
          width: Math.max(1, Math.round(place.rect.width)),
          height: Math.max(1, Math.round(place.rect.height)),
          theme,
        });
        if (still) {
          held.push({
            view: view.id,
            spot: place.spot,
            explorable: place.explorable,
            theme,
            png: still.data,
          });
        }
      }
    }
  }
  return held;
}

/** The tab's `stillOf` for the exports of a project, as its canvas keeps them. */
export function useExportStillOf(
  project: ProjectSnapshot | undefined,
): ((spot: ExplorableSpot) => ExplorableStillPicture | undefined) | undefined {
  const stills = useExplorableStills();
  const session = useExplorableSession();
  const { approvals } = useExplorableApprovals();
  const t = useT();
  const lookup = useAttributeLookup();
  return useMemo(
    () =>
      project &&
      exportStillOf({
        project,
        stills,
        session,
        approvals,
        language: t.language,
        sources: (id) => ({
          computed: lookup.computedOf(id),
          live: lookup.liveOf(id),
          simulated: lookup.simulatedOf(id),
        }),
      }),
    [project, stills, session, approvals, t, lookup],
  );
}
