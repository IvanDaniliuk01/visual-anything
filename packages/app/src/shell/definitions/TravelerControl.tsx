import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { Id, Traveler } from '@visual-anything/schema';
import { useId } from 'react';
import { useT } from '../../i18n';
import { SelectControl, TextControl } from '../inspector/controls';
import { ImageControl } from './ImageControl';
import {
  TRAVELER_SIZE,
  TRAVELER_SPACING,
  TRAVELER_SPEEDS,
  isTravelerSpeed,
  travelerPictureAction,
  travelerWith,
  withinRange,
  type TravelerChange,
} from './travelerCommands';

interface TravelerControlProps {
  project: ProjectSnapshot;
  /** The relation type whose package a new picture goes in, or the relation's. */
  relationType: Id;
  /** The traveler its lines send now, from whichever appearance; none when they send none. */
  traveler: Traveler | undefined;
  disabled: boolean;
  /** The command that stores a change of the traveler at the level the control changes. */
  set: (change: TravelerChange) => Command;
  /** What the action that defines a new picture and sends it is called. */
  label: string;
  send: (command: Command) => Promise<boolean>;
  describedBy?: string | undefined;
}

/**
 * A traveler's controls (ADR 0110): its picture, chosen as a shape's is but always drawn in its own
 * colors; while one is sent, its size on screen, its speed and the spacing between travelers, and a
 * way to send none, which takes an inherited one away. Each change sends the whole traveler.
 */
export function TravelerControl({
  project,
  relationType,
  traveler,
  disabled,
  set,
  label,
  send,
  describedBy,
}: TravelerControlProps) {
  const t = useT();
  const sizeId = useId();
  const speedId = useId();
  const spacingId = useId();
  const change = (changes: Parameters<typeof travelerWith>[1]) =>
    traveler === undefined ? Promise.resolve(true) : send(set(travelerWith(traveler, changes)));

  return (
    <>
      <ImageControl
        project={project}
        shown={traveler === undefined ? undefined : { image: traveler.image }}
        disabled={disabled}
        placing={false}
        describedBy={describedBy}
        send={send}
        actionFor={(choice) =>
          travelerPictureAction(project, relationType, choice, traveler, set, label)
        }
      />
      {traveler !== undefined && (
        <div className="image-control-options">
          <label htmlFor={sizeId}>{t('Size')}</label>
          <TextControl
            id={sizeId}
            value={String(traveler.size ?? TRAVELER_SIZE.default)}
            inputType="number"
            disabled={disabled}
            problemOf={(text) =>
              withinRange(text, TRAVELER_SIZE) ? undefined : t('Enter a size from 8 to 64 pixels.')
            }
            onCommit={(text) => change({ size: Number(text) })}
          />
          <label htmlFor={speedId}>{t('Speed')}</label>
          <SelectControl
            id={speedId}
            value={traveler.speed ?? 'normal'}
            disabled={disabled}
            onCommit={async (speed) => {
              if (isTravelerSpeed(speed)) await change({ speed });
            }}
          >
            {TRAVELER_SPEEDS.map(({ speed, name }) => (
              <option key={speed} value={speed}>
                {t(name)}
              </option>
            ))}
          </SelectControl>
          <label htmlFor={spacingId}>{t('Spacing')}</label>
          <TextControl
            id={spacingId}
            value={String(traveler.spacing ?? TRAVELER_SPACING.default)}
            inputType="number"
            disabled={disabled}
            problemOf={(text) =>
              withinRange(text, TRAVELER_SPACING)
                ? undefined
                : t('Enter a spacing from 40 to 2,000 canvas units.')
            }
            onCommit={(text) => change({ spacing: Number(text) })}
          />
        </div>
      )}
      {traveler !== undefined && (
        <button
          type="button"
          className="inspector-action"
          disabled={disabled}
          onClick={() => void send(set('none'))}
        >
          {t('Send no traveler')}
        </button>
      )}
    </>
  );
}
