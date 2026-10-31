/**
 * An element's pose in the inspector (ADR 0076): whether it is in physical space and how, posed in
 * which container or World, anchored to which part of which solid, or not at all; for a posed one,
 * where it is in its container's coordinates, in mm, cm, m or km, and its rotation in degrees about
 * X, then Y, then Z, each edit sending one `update-element` with the whole pose, and so one undoable
 * action. Choosing what it is posed in keeps its place when it is in physical space. Place in physical
 * space, Take out of physical space, and Pose in World where it was for a pose whose container no
 * longer holds it. An anchored part shows where its part is, and is not posed here. While the project
 * cannot be changed, every control is read-only.
 */
import { modelIndexOf } from '@visual-anything/core';
import type { Element, Id, Pose } from '@visual-anything/schema';
import { useId, useMemo, useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { useSpacePanel, useSpacePanelState } from '../../space/context';
import { SelectControl, TextControl } from './controls';
import {
  formatDegrees,
  formatLength,
  lengthProblem,
  lengthUnitOf,
  readDegrees,
  readLength,
} from './lengths';
import {
  degreesOfPose,
  placedPose,
  poseContainersOf,
  poseInWorldWhereItWas,
  poseMeasuredFrom,
  poseStatusOf,
  poseWithAt,
  poseWithDegrees,
} from './pose';
import './pose.css';

type Axis = 'x' | 'y' | 'z';
const AXES: readonly Axis[] = ['x', 'y', 'z'];
const AXIS_NAMES: Record<Axis, string> = { x: 'X', y: 'Y', z: 'Z' };
const ABOUT: Record<Axis, string> = { x: 'About X', y: 'About Y', z: 'About Z' };

export function PoseSection({ element }: { element: Element }) {
  const t = useT();
  const { project, viewId, send } = useEditor();
  const panelShows = useSpacePanelState(useSpacePanel(), viewId)?.root;
  const headingId = useId();
  const containerId = useId();
  // Each message counts, so that the same words said again are heard again.
  const [message, setMessage] = useState({ text: '', count: 0 });
  const status = useMemo(() => poseStatusOf(project, element), [project, element]);
  const editable = send !== undefined;
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const say = (text: string) => setMessage((last) => ({ text, count: last.count + 1 }));

  /** Sends the element's pose, `null` taking it away, and says what was done once it is. */
  const setPose = async (pose: Pose | null, done?: string): Promise<boolean> => {
    if (!send) return false;
    try {
      const result = await send({ type: 'update-element', id: element.id, changes: { pose } });
      if (result.ok && done !== undefined) say(done);
      return result.ok;
    } catch {
      return false;
    }
  };
  const takeOut = (
    <button
      type="button"
      className="inspector-action"
      disabled={!editable}
      onClick={() =>
        void setPose(null, t('Took “{name}” out of physical space.', { name: element.name }))
      }
    >
      {t('Take out of physical space')}
    </button>
  );

  let body;
  switch (status.kind) {
    case 'world':
      body = (
        <p className="inspector-notes">
          {t('Physical space is measured from World, which has no pose of its own.')}
        </p>
      );
      break;
    case 'none':
      body = (
        <>
          <p className="inspector-notes">{t('Not in physical space: it has no pose.')}</p>
          <button
            type="button"
            className="inspector-action"
            disabled={!editable}
            onClick={() => {
              const pose = placedPose(project, element.id, panelShows);
              void setPose(
                pose,
                t('Placed “{name}” at the origin of “{container}”.', {
                  name: element.name,
                  container: nameOf(pose.in ?? index.world.id),
                }),
              );
            }}
          >
            {t('Place in physical space')}
          </button>
        </>
      );
      break;
    case 'anchored': {
      const container = nameOf(status.in);
      body = (
        <>
          <p className="inspector-notes">
            {t('Anchored to the part “{part}” of the solid “{solid}”, which “{container}” shows.', {
              part: status.part,
              solid: status.solid,
              container,
            })}
          </p>
          <p className="inspector-notes">
            {t('Where its part is, from “{container}”: x {x}, y {y}, z {z}.', {
              container,
              x: formatLength(status.at.x),
              y: formatLength(status.at.y),
              z: formatLength(status.at.z),
            })}
          </p>
          <p className="inspector-notes">
            {t('Its place is its solid’s, so it cannot be posed here.')}
          </p>
          {status.pose && (
            <p className="inspector-notes">{t('The pose it has is kept and not used.')}</p>
          )}
        </>
      );
      break;
    }
    case 'unusable': {
      const gone = index.element(status.in) === undefined;
      body = (
        <>
          <p className="inspector-notes inspector-warning">
            {gone
              ? t(
                  'Its pose is measured from “{container}”, which is gone, so it is not in physical space.',
                  { container: status.in },
                )
              : t(
                  'Its pose is measured from “{container}”, which no longer holds it, so it is not in physical space.',
                  { container: nameOf(status.in) },
                )}
          </p>
          <button
            type="button"
            className="inspector-action"
            disabled={!editable}
            onClick={() => {
              const { pose, known } = poseInWorldWhereItWas(project, status.pose);
              void setPose(
                pose,
                known
                  ? t('Posed “{name}” in World, where it was.', { name: element.name })
                  : t('Posed “{name}” at the origin of World: where it was is not known.', {
                      name: element.name,
                    }),
              );
            }}
          >
            {t('Pose in World where it was')}
          </button>{' '}
          {takeOut}
        </>
      );
      break;
    }
    case 'posed': {
      const { pose } = status;
      const container = nameOf(status.in);
      const degrees = degreesOfPose(pose);
      body = (
        <>
          {!status.inWorld && (
            <p className="inspector-notes">
              {t(
                '“{container}” is in no place under World, so “{name}” shows in physical space when the panel shows “{container}”.',
                { container, name: element.name },
              )}
            </p>
          )}
          <div className="inspector-control">
            <label htmlFor={containerId}>{t('Posed in')}</label>
            <SelectControl
              id={containerId}
              value={status.in}
              disabled={!editable}
              onCommit={async (to) => {
                const measured = poseMeasuredFrom(project, element.id, pose, to);
                await setPose(
                  measured.pose,
                  measured.kept
                    ? t('“{name}” is posed in “{container}” now, where it was.', {
                        name: element.name,
                        container: nameOf(to),
                      })
                    : t('“{name}” is posed in “{container}” now.', {
                        name: element.name,
                        container: nameOf(to),
                      }),
                );
              }}
            >
              {poseContainersOf(project, element.id).map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)}
                </option>
              ))}
            </SelectControl>
          </div>
          <fieldset className="inspector-pose-fields">
            <legend>{t('Where it is, from “{container}”', { container })}</legend>
            {AXES.map((axis) => (
              <LengthField
                key={axis}
                label={t(AXIS_NAMES[axis])}
                meters={pose.at[axis]}
                disabled={!editable}
                onCommit={(meters) => setPose(poseWithAt(pose, axis, meters))}
              />
            ))}
          </fieldset>
          <fieldset className="inspector-pose-fields">
            <legend>{t('Rotation, in degrees about X, then Y, then Z')}</legend>
            {AXES.map((axis) => (
              <DegreesField
                key={axis}
                label={t(ABOUT[axis])}
                degrees={degrees[axis]}
                disabled={!editable}
                onCommit={(value) => setPose(poseWithDegrees(pose, axis, value))}
              />
            ))}
          </fieldset>
          {takeOut}
        </>
      );
      break;
    }
  }

  return (
    <section className="inspector-section inspector-pose" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Pose')}</h4>
      {status.kind === 'posed' && (
        <p className="inspector-notes">
          {t('Posed in “{container}”.', { container: nameOf(status.in) })}
        </p>
      )}
      {body}
      <p role="status" className="visually-hidden">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
    </section>
  );
}

interface FieldProps {
  label: string;
  disabled: boolean;
}

/** One coordinate of a place: shown in the unit that suits it, and read in any. */
function LengthField({
  label,
  meters,
  disabled,
  onCommit,
}: FieldProps & { meters: number; onCommit: (meters: number) => Promise<boolean> }) {
  const id = useId();
  const unit = lengthUnitOf(meters);
  return (
    <div className="inspector-pose-field">
      <label htmlFor={id}>{label}</label>
      <TextControl
        id={id}
        value={formatLength(meters)}
        disabled={disabled}
        problemOf={(text) => lengthProblem(text, unit)}
        same={(a, b) => {
          const [first, second] = [readLength(a, unit), readLength(b, unit)];
          return first.ok && second.ok && Math.abs(first.value - second.value) < 1e-9;
        }}
        onCommit={async (text) => {
          const reading = readLength(text, unit);
          if (reading.ok) await onCommit(reading.value);
        }}
      />
    </div>
  );
}

/** One angle of a rotation, in degrees. */
function DegreesField({
  label,
  degrees,
  disabled,
  onCommit,
}: FieldProps & { degrees: number; onCommit: (degrees: number) => Promise<boolean> }) {
  const id = useId();
  return (
    <div className="inspector-pose-field">
      <label htmlFor={id}>{label}</label>
      <TextControl
        id={id}
        value={formatDegrees(degrees)}
        disabled={disabled}
        problemOf={(text) => {
          const reading = readDegrees(text);
          return reading.ok ? undefined : reading.message;
        }}
        same={(a, b) => {
          const [first, second] = [readDegrees(a), readDegrees(b)];
          return first.ok && second.ok && Math.abs(first.value - second.value) < 1e-4;
        }}
        onCommit={async (text) => {
          const reading = readDegrees(text);
          if (reading.ok) await onCommit(reading.value);
        }}
      />
    </div>
  );
}
