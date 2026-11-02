/**
 * The physical-space panel's joints (ADR 0090), a section under its ways of reading that opens and
 * closes: a slider for each joint among what the panel shows, named by the joint, ranged by its limits,
 * in degrees or meters, moved by the pointer or the keys. Moving one moves the chain at once, through
 * positions the panel gives over the joints' own, and stores nothing. "Keep these positions" stores
 * those that differ as one action of the person's; "Back to stored positions" lets them go. Where
 * nothing can ever be changed, as in the read-only page, the sliders still move the chain, and there
 * is nothing to keep.
 */
import type { Id } from '@visual-anything/schema';
import { useId, useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { ChevronDownIcon } from '../shell/icons';
import { formatDegrees, formatLength } from '../shell/inspector/lengths';
import { changedPositions, keepPositionsCommand, positionOf, type ShownJoint } from './joints';
import type { JointPositionsControl } from './useJointPositions';

interface SpaceJointsProps {
  joints: readonly ShownJoint[];
  control: JointPositionsControl;
  say: (text: string) => void;
  /** Whether nothing can ever be changed here, as in the read-only page: then nothing is kept. */
  readOnly?: boolean | undefined;
}

/** A joint's position as its slider says it: degrees, or a length. */
function positionText(joint: ShownJoint, position: number): string {
  return joint.unit === 'degrees'
    ? formatDegrees(Math.round(position * 10) / 10)
    : formatLength(position);
}

export function SpaceJoints({ joints, control, say, readOnly = false }: SpaceJointsProps) {
  const t = useT();
  const { send } = useEditor();
  const region = useId();
  const [open, setOpen] = useState(true);
  const changed = changedPositions(joints, control.positions);
  const given = control.given;
  const nameOf = (id: Id) => joints.find((joint) => joint.element === id)?.name ?? id;

  const keep = async () => {
    const command = keepPositionsCommand(joints, control.positions);
    if (!command || !send) return;
    const result = await send(command).catch(() => ({ ok: false }));
    if (!result.ok) return;
    control.clear();
    const [first] = changed.keys();
    say(
      changed.size === 1 && first !== undefined
        ? t('Kept the position of “{name}”.', { name: nameOf(first) })
        : t('Kept the positions of {count} joints.', { count: changed.size }),
    );
  };

  const back = () => {
    control.back(joints);
    say(t('Back to the stored positions.'));
  };

  return (
    <section className="space-panel-joints" aria-label={t('Joints')}>
      <button
        type="button"
        className="space-panel-joints-toggle"
        aria-expanded={open}
        aria-controls={region}
        onClick={() => setOpen((was) => !was)}
      >
        <ChevronDownIcon />
        {t({ one: '{count} joint', other: '{count} joints' }, { count: joints.length })}
      </button>
      {open && (
        <div id={region} className="space-panel-joints-body">
          <ul className="space-panel-joints-list">
            {joints.map((joint) => {
              const position = positionOf(joint, control.positions);
              const shown = Math.min(joint.max, Math.max(joint.min, position));
              return (
                <li key={joint.element} className="space-panel-joint">
                  <label htmlFor={`${region}-${joint.element}`} className="space-panel-joint-name">
                    {joint.name}
                  </label>
                  <input
                    id={`${region}-${joint.element}`}
                    type="range"
                    className="space-panel-slider space-panel-joint-slider"
                    min={joint.min}
                    max={joint.max}
                    step={joint.step}
                    value={shown}
                    aria-valuetext={positionText(joint, position)}
                    onChange={(event) => control.set(joint.element, Number(event.target.value))}
                  />
                  <span className="space-panel-value" aria-hidden="true">
                    {positionText(joint, position)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="space-panel-joints-actions">
            {!readOnly && (
              <button
                type="button"
                className="space-panel-tool"
                disabled={send === undefined || changed.size === 0}
                onClick={() => void keep()}
              >
                {t('Keep these positions')}
              </button>
            )}
            <button type="button" className="space-panel-tool" disabled={!given} onClick={back}>
              {t('Back to stored positions')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
