import type { Command } from '@visual-anything/core';
import { useId, type ReactNode } from 'react';
import { InlineProblem } from '../inspector/controls';
import { useSender } from './useSender';

/** What a trait row gives its control. */
export interface TraitControl {
  /** The control's id, which the row's label names. */
  id: string;
  /** What describes the control: where the trait comes from, a note, a problem. */
  describedBy: string;
  /** Sends a command for this trait; a refusal shows inline under the row. */
  send: (command: Command) => Promise<boolean>;
}

interface TraitRowProps {
  label: string;
  /** Where the trait comes from, in words: "its own", "from Database". */
  source: string;
  /** Whether the definition sets the trait itself. */
  own: boolean;
  /** Whether nothing can be changed, as for a built-in definition. */
  readOnly: boolean;
  /** The command that takes the trait out, so that it is inherited again; none offers no way back. */
  inherit?: (() => Command) | undefined;
  /** What the way back is called, such as "Use the inherited color"; "Use the inherited value" by default. */
  inheritLabel?: string;
  /** A note under the control, such as why it is disabled. */
  note?: string | undefined;
  /**
   * Whether the trait is edited by several controls, such as a list: the label then names a group
   * holding them, not one control.
   */
  group?: boolean;
  children: (control: TraitControl) => ReactNode;
}

/**
 * One trait of a definition in the component editor: its label, its controls, where it comes from,
 * and, while the definition sets it, the way back to the inherited value. Each committed control sends
 * one command, and so makes one undoable action.
 */
export function TraitRow({
  label,
  source,
  own,
  readOnly,
  inherit,
  inheritLabel = 'Use the inherited value',
  note,
  group = false,
  children,
}: TraitRowProps) {
  const id = useId();
  const labelId = useId();
  const sourceId = useId();
  const noteId = useId();
  const problemId = useId();
  const sender = useSender();
  const describedBy = [
    sourceId,
    note === undefined ? undefined : noteId,
    sender.problem === undefined ? undefined : problemId,
  ]
    .filter((each) => each !== undefined)
    .join(' ');
  const control = children({ id, describedBy, send: sender.send });

  return (
    <li className="definition-trait">
      <div className="definition-trait-head">
        {group ? (
          <span id={labelId} className="definition-trait-label">
            {label}
          </span>
        ) : (
          <label htmlFor={id} className="definition-trait-label">
            {label}
          </label>
        )}
        <span id={sourceId} className={own ? 'definition-source is-own' : 'definition-source'}>
          {source}
        </span>
      </div>
      {group ? (
        <div role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
          {control}
        </div>
      ) : (
        <div className="definition-trait-control">{control}</div>
      )}
      {note !== undefined && (
        <p id={noteId} className="inspector-notes">
          {note}
        </p>
      )}
      {own && !readOnly && inherit !== undefined && (
        <button
          type="button"
          className="inspector-action"
          aria-label={`${inheritLabel} for ${label}`}
          onClick={() => void sender.send(inherit())}
        >
          {inheritLabel}
        </button>
      )}
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </li>
  );
}
