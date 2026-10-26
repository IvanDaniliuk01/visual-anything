/** Parts the component editor's editors share. */
import type { Command } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useMemo, type MouseEvent } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { InlineProblem } from '../inspector/controls';
import { refusalOf, type DefinitionKind } from './commands';
import { backToSelection } from './focus';
import { useOpenDefinition } from './opened';
import { useSender } from './useSender';

const NOUN: Record<DefinitionKind, string> = {
  component: 'component',
  'relation-type': 'relation type',
};

/**
 * Says that a built-in definition is read-only, and offers to derive one of the project's own from
 * it instead.
 */
export function BuiltInNote({ kind, id, name }: { kind: DefinitionKind; id: Id; name: string }) {
  const t = useT();
  const { send } = useEditor();
  const { open } = useOpenDefinition();
  return (
    <div className="definition-built-in">
      <p className="inspector-notes">
        {t(
          'It is built into Visual Anything, so only its appearance can be changed here, for this project. Derive a {noun} from it to have one of the project’s own that you can change in full.',
          { noun: t(NOUN[kind]) },
        )}
      </p>
      {open !== undefined && (
        <button
          type="button"
          className="inspector-action"
          disabled={send === undefined}
          onClick={() => open({ kind: 'derive', of: kind, base: id }, { focus: true })}
        >
          {kind === 'component'
            ? t('Derive a component from “{name}”', { name: t.definition(id, name) })
            : t('Derive a relation type from “{name}”', { name: t.definition(id, name) })}
        </button>
      )}
    </div>
  );
}

/** Says that what the component editor shows no longer exists, as after an undo. */
export function Gone({ what }: { what: string }) {
  const t = useT();
  return (
    <p className="inspector-warning">{t('No package in use defines {what} any more.', { what })}</p>
  );
}

/**
 * Removes a component or relation type of the project's own, then shows the selection again. It is
 * disabled, with the core's reason, while anything uses the definition.
 */
export function RemoveDefinition({ kind, id }: { kind: DefinitionKind; id: Id }) {
  const t = useT();
  const { project, send } = useEditor();
  const { close } = useOpenDefinition();
  const sender = useSender();
  const reasonId = useId();
  const problemId = useId();
  const command = useMemo<Command>(
    () =>
      kind === 'component'
        ? { type: 'remove-component', id }
        : { type: 'remove-relation-type', id },
    [kind, id],
  );
  const refusal = useMemo(() => refusalOf(project, command), [project, command]);

  const remove = async (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    if (await sender.send(command)) backToSelection(button, close);
  };

  return (
    <section className="inspector-section definition-remove">
      <button
        type="button"
        className="inspector-action"
        disabled={send === undefined || refusal !== undefined}
        aria-describedby={
          [refusal ? reasonId : undefined, sender.problem ? problemId : undefined]
            .filter((each) => each !== undefined)
            .join(' ') || undefined
        }
        onClick={(event) => void remove(event)}
      >
        {t('Remove the {noun}', { noun: t(NOUN[kind]) })}
      </button>
      {refusal !== undefined && (
        <p id={reasonId} className="inspector-notes">
          {t.message(refusal.message)}
        </p>
      )}
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </section>
  );
}
