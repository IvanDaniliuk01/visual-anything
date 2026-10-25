import { builtinPackage, type Command, type UpdatePackageCommand } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useMemo, type MouseEvent, type Ref } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { InlineProblem, TextControl } from '../inspector/controls';
import { count } from '../inspector/describe';
import { Detail, Title } from '../inspector/parts';
import { sameOptionalText } from '../inspector/text';
import { refusalOf, startUsingPackageCommand, stopUsingPackageCommand } from './commands';
import { Field } from './Field';
import { backToSelection } from './focus';
import { useOpenDefinition } from './opened';
import { Gone } from './parts';
import { useSender } from './useSender';

interface PackageEditorProps {
  id: Id;
  titleRef: Ref<HTMLHeadingElement>;
}

/**
 * One package: its name and description, which a package of the project's own changes; what it
 * defines, each of which opens in the component editor; and using it, or no longer using it, which
 * is disabled with the reason while anything comes from it.
 */
export function PackageEditor({ id, titleRef }: PackageEditorProps) {
  const { project, send, viewId } = useEditor();
  const { open } = useOpenDefinition();
  const componentsId = useId();
  const relationTypesId = useId();
  const builtin = builtinPackage(id);
  const file = project.packages.find((each) => each.id === id) ?? builtin;
  if (!file) {
    return (
      <>
        <Title titleRef={titleRef} name={id} detail="Package" />
        <Gone what={`the package “${id}”`} />
      </>
    );
  }
  const inUse = project.project.packages.includes(id);
  const readOnly = builtin !== undefined || send === undefined;
  const update = (changes: UpdatePackageCommand['changes']): Command => ({
    type: 'update-package',
    id,
    changes,
  });
  const opener = (kind: 'component' | 'relation-type', other: Id) =>
    open === undefined ? undefined : () => open({ kind, id: other }, { focus: true });

  return (
    <>
      <Title
        titleRef={titleRef}
        name={file.name}
        detail={builtin ? 'Built-in package' : 'Package'}
      />
      {builtin && (
        <p className="inspector-notes">
          It is built into Visual Anything, so it cannot be changed here.
          {inUse ? '' : ' The project does not use it yet.'}
        </p>
      )}
      <section className="inspector-section">
        <Field label="Name">
          {({ id: controlId, describedBy, send: sendIt }) => (
            <TextControl
              id={controlId}
              value={file.name}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={async (text) => {
                if (text.trim() !== '') await sendIt(update({ name: text }));
              }}
            />
          )}
        </Field>
        <Field label="Description">
          {({ id: controlId, describedBy, send: sendIt }) => (
            <TextControl
              id={controlId}
              value={file.description ?? ''}
              multiline
              disabled={readOnly}
              describedBy={describedBy}
              same={sameOptionalText}
              onCommit={(text) => sendIt(update({ description: text.trim() === '' ? null : text }))}
            />
          )}
        </Field>
        <dl className="details">
          <Detail term="Id">
            <code>{id}</code>
          </Detail>
          {/* Its images, once images are wired into the editor: listed, added from a file and removed. */}
          <Detail term="Images">{count(file.images?.length ?? 0, 'image')}</Detail>
        </dl>
      </section>
      <section className="inspector-section" aria-labelledby={componentsId}>
        <h4 id={componentsId}>Components</h4>
        <Defined
          labelledBy={componentsId}
          items={file.components.map((each) => ({ id: each.id, name: each.name }))}
          none="It defines no components."
          open={inUse ? (other) => opener('component', other) : () => undefined}
        />
      </section>
      <section className="inspector-section" aria-labelledby={relationTypesId}>
        <h4 id={relationTypesId}>Relation types</h4>
        <Defined
          labelledBy={relationTypesId}
          items={file.relationTypes.map((each) => ({ id: each.id, name: each.name }))}
          none="It defines no relation types."
          open={inUse ? (other) => opener('relation-type', other) : () => undefined}
        />
      </section>
      {inUse ? (
        <StopUsing id={id} own={builtin === undefined} />
      ) : (
        <UsePackage id={id} viewId={viewId} />
      )}
    </>
  );
}

interface DefinedProps {
  labelledBy: string;
  items: readonly { id: Id; name: string }[];
  none: string;
  open: (id: Id) => (() => void) | undefined;
}

function Defined({ labelledBy, items, none, open }: DefinedProps) {
  if (items.length === 0) return <p className="panel-empty">{none}</p>;
  return (
    <ul className="inspector-selectables" aria-labelledby={labelledBy}>
      {items.map((item) => {
        const opens = open(item.id);
        return (
          <li key={item.id}>
            {opens ? (
              <button type="button" className="inspector-selectable" onClick={opens}>
                <span className="inspector-selectable-name">{item.name}</span>
              </button>
            ) : (
              item.name
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Starts using a built-in package, and nests the open view by its nesting relation types. */
function UsePackage({ id, viewId }: { id: Id; viewId: Id | undefined }) {
  const { project, send } = useEditor();
  const sender = useSender();
  const problemId = useId();
  const command = startUsingPackageCommand(project, id, viewId);
  return (
    <section className="inspector-section">
      <button
        type="button"
        className="inspector-action"
        disabled={send === undefined || command === undefined}
        onClick={() => {
          if (command) void sender.send(command);
        }}
      >
        Use this package
      </button>
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </section>
  );
}

/**
 * Stops using a package. A package of the project's own goes with its file and what it defines, which
 * Undo brings back; it is disabled, with the core's reason, while anything comes from the package.
 */
function StopUsing({ id, own }: { id: Id; own: boolean }) {
  const { project, send } = useEditor();
  const { close } = useOpenDefinition();
  const sender = useSender();
  const reasonId = useId();
  const noteId = useId();
  const command = useMemo(() => stopUsingPackageCommand(project, id), [project, id]);
  const refusal = useMemo(() => refusalOf(project, command), [project, command]);
  const file = project.packages.find((each) => each.id === id);
  const defines = [
    count(file?.components.length ?? 0, 'component'),
    count(file?.relationTypes.length ?? 0, 'relation type'),
  ].join(' and ');

  const stop = async (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    if (await sender.send(command)) backToSelection(button, close);
  };

  return (
    <section className="inspector-section definition-remove">
      <button
        type="button"
        className="inspector-action"
        disabled={send === undefined || refusal !== undefined}
        aria-describedby={refusal ? reasonId : own ? noteId : undefined}
        onClick={(event) => void stop(event)}
      >
        {own ? 'Remove this package' : 'Stop using this package'}
      </button>
      {refusal !== undefined ? (
        <p id={reasonId} className="inspector-notes">
          {refusal.message}
        </p>
      ) : (
        own && (
          <p id={noteId} className="inspector-notes">
            Its file goes, with the {defines} it defines; Undo brings them back.
          </p>
        )
      )}
      {sender.problem !== undefined && (
        <InlineProblem id={`${reasonId}-problem`} text={sender.problem} />
      )}
    </section>
  );
}
