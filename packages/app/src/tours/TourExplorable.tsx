/**
 * A tour step's explorable while the tour plays (ADR 0107): live, as the explorable panel shows one,
 * with the values the step sets and the step under way in its data. The explorable panel hides while
 * a tour plays full screen, so the stage hosts it beside the caption. The same explorable stays loaded
 * from one step to the next and only gets its new data, so that moving through the tour never reloads
 * its page; it shows its card when it does not run. Nothing it asks selects on the canvas while the
 * tour plays: a step shows what it was written to show.
 */
import { stepExplorableValues, type ProjectSnapshot, type VaData } from '@visual-anything/core';
import type { TourFile, TourStep } from '@visual-anything/schema';
import { useMemo } from 'react';
import { ExplorableView } from '../explorables/ExplorableView';

export function TourExplorable({
  project,
  tour,
  step,
}: {
  project: ProjectSnapshot;
  tour: TourFile;
  step: TourStep;
}) {
  const shown = step.explorable;
  const values = useMemo(
    () => (shown === undefined ? undefined : stepExplorableValues(project, { explorable: shown })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the values follow the packages and the step
    [project.packages, shown],
  );
  const title = step.caption.title;
  const under = useMemo<VaData['step']>(
    () => ({ kind: 'tour', id: tour.id, step: step.id, title }),
    [tour.id, step.id, title],
  );
  if (shown === undefined) return null;
  return (
    <ExplorableView
      key={shown.id}
      project={project}
      explorable={shown.id}
      parameters={values}
      step={under}
    />
  );
}
