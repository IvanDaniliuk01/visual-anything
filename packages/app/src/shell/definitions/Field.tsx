import type { Command } from '@visual-anything/core';
import { useId, type ReactNode } from 'react';
import { InlineProblem } from '../inspector/controls';
import { useSender } from './useSender';

interface FieldProps {
  label: string;
  /** A note under the control. */
  note?: string | undefined;
  children: (control: {
    id: string;
    describedBy: string | undefined;
    send: (command: Command) => Promise<boolean>;
  }) => ReactNode;
}

/**
 * A labelled control of the component editor that is not inherited, such as a name: it sends one
 * command when committed, and says inline why the core refused one.
 */
export function Field({ label, note, children }: FieldProps) {
  const id = useId();
  const noteId = useId();
  const problemId = useId();
  const sender = useSender();
  const ids = [
    note === undefined ? undefined : noteId,
    sender.problem === undefined ? undefined : problemId,
  ].filter((each) => each !== undefined);
  return (
    <div className="inspector-control">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        describedBy: ids.length > 0 ? ids.join(' ') : undefined,
        send: sender.send,
      })}
      {note !== undefined && (
        <p id={noteId} className="inspector-notes">
          {note}
        </p>
      )}
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </div>
  );
}
