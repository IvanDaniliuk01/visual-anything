/** The shell's full-screen playback (ADR 0058, ADR 0077): the stage of the tour the tab plays, if any. */
import type { ProjectSnapshot } from '@visual-anything/core';
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
  const { playback, transition, stage, act, goTo, card } = tours;
  const tour = project.tours.find((each) => each.id === playback.tour);
  if (!tour) return null;
  return (
    <TourStage
      project={project}
      tour={tour}
      step={playback.step}
      reveal={playback.reveal}
      {...(transition.caption === undefined
        ? {}
        : {
            caption: {
              step: transition.caption,
              phase: transition.phase,
              fade: transition.fade,
              reveal: stage.captionReveal,
            },
          })}
      onAction={act}
      notes={notes}
      scenario={stage.scenario}
      advancing={stage.advancing}
      looked={stage.looked}
      index={stage.index}
      onGoTo={goTo}
      place={stage.place}
      said={stage.said}
      fades={stage.fades}
      cardRef={card}
      leader={stage.leader}
    />
  );
}
