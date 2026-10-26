/** The shell's full-screen playback (ADR 0058): the stage of the tour the tab plays, if any. */
import type { ProjectSnapshot } from '@visual-anything/core';
import { applyTourKey } from './player';
import { TourStage } from './TourStage';
import type { TourPlaybackOutput } from './useTourPlayback';

export function TourPlaybackLayer({
  project,
  tours,
  notes = true,
}: {
  project: ProjectSnapshot;
  tours: TourPlaybackOutput;
  /** Whether the speaker notes window is offered: not in the read-only page, which has none. */
  notes?: boolean;
}) {
  const { player, playback } = tours;
  const tour = project.tours.find((each) => each.id === playback.tour);
  if (!tour) return null;
  return (
    <TourStage
      project={project}
      tour={tour}
      step={playback.step}
      onAction={(action) => applyTourKey(player, action)}
      notes={notes}
    />
  );
}
