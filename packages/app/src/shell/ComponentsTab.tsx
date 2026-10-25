import { ESSENCE_ID, RELATES_TO_ID, type Id, type PackageFile } from '@visual-anything/schema';
import { useId, useMemo, useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import { startUsingPackageCommand, unusedBuiltInPackages } from './definitions/commands';
import { openedKey, useOpenDefinition } from './definitions/opened';
import { definitionTree, targetOf, type DefinitionRow } from './definitions/tree';
import { nameOf } from './definitions/traits';
import { useSender } from './definitions/useSender';
import { InlineProblem } from './inspector/controls';
import { Secondary } from './Secondary';
import { shownRows, type TreeRow } from './tree';
import { VirtualTree } from './VirtualTree';
import './definitions/definitions.css';

interface ComponentsTabProps {
  /** Whether the tab is the one shown; a hidden tab draws nothing and keeps its state. */
  active: boolean;
}

/**
 * The project's components, relation types and packages: the packages in use, its own first, each
 * with its components (and what each derives from) and its relation types, any of which opens in the
 * component editor with Enter or a click; then the built-in packages not in use yet, each with Use;
 * and the ways to make a new component, relation type or package.
 */
export function ComponentsTab({ active }: ComponentsTabProps) {
  const { project, definitions, send } = useEditor();
  const { opened, open } = useOpenDefinition();
  const inUseHeading = useId();
  const unusedHeading = useId();
  const newHeading = useId();
  // The packages someone opened (true) or closed (false); the project's own start open.
  const [openRows, setOpenRows] = useState<ReadonlyMap<string, boolean>>(new Map());
  const items = useMemo(() => definitionTree(project), [project]);
  const shown = useMemo(
    () =>
      shownRows(
        items,
        (item, id) => openRows.get(id) ?? (item.kind === 'package' && !item.builtIn),
      ),
    [items, openRows],
  );
  if (!active) return null;

  const selected = openedKey(opened);
  const unused = unusedBuiltInPackages(project);
  const creating = send !== undefined && open !== undefined;
  const detailOf = (row: TreeRow<DefinitionRow>): string => {
    const { item } = row;
    if (item.kind === 'package') return item.builtIn ? 'Built-in package' : 'Package';
    const kind = item.kind === 'component' ? 'Component' : 'Relation type';
    return `${kind}, derives from ${nameOf(definitions, item.kind, item.derivesFrom)}`;
  };

  return (
    <div className="components-tab">
      <section className="panel-section components-in-use">
        <h3 id={inUseHeading}>In use</h3>
        {shown.rows.length > 0 ? (
          <VirtualTree
            shown={shown}
            labelledBy={inUseHeading}
            selectedId={selected}
            isSelected={(row) => row.id === selected}
            textOf={(row) => row.item.name}
            onOpen={(row, value) => setOpenRows((current) => new Map(current).set(row.id, value))}
            onActivate={(row) => open?.(targetOf(row.item))}
            renderRow={(row) => (
              <>
                <span className="item-name">{row.item.name}</span>
                <Secondary text={detailOf(row)} />
              </>
            )}
          />
        ) : (
          <p className="panel-empty">The project uses no package yet.</p>
        )}
      </section>

      <section className="panel-section">
        <h3 id={unusedHeading}>Not in use yet</h3>
        {unused.length > 0 ? (
          <ul className="item-list components-unused" aria-labelledby={unusedHeading}>
            {unused.map((file) => (
              <UnusedPackage key={file.id} file={file} />
            ))}
          </ul>
        ) : (
          <p className="panel-empty">The project uses every built-in package.</p>
        )}
      </section>

      <section className="panel-section">
        <h3 id={newHeading}>New</h3>
        <div className="components-actions" role="group" aria-labelledby={newHeading}>
          <NewButton
            disabled={!creating}
            onClick={() =>
              open?.({ kind: 'derive', of: 'component', base: ESSENCE_ID }, { focus: true })
            }
          >
            New component
          </NewButton>
          <NewButton
            disabled={!creating}
            onClick={() =>
              open?.({ kind: 'derive', of: 'relation-type', base: RELATES_TO_ID }, { focus: true })
            }
          >
            New relation type
          </NewButton>
          <NewButton
            disabled={!creating}
            onClick={() => open?.({ kind: 'new-package' }, { focus: true })}
          >
            New package
          </NewButton>
        </div>
      </section>
    </div>
  );
}

function NewButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button type="button" className="components-action" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** A built-in package the project does not use yet: what it holds, and Use. */
function UnusedPackage({ file }: { file: PackageFile }) {
  const { project, send, viewId } = useEditor();
  const { open } = useOpenDefinition();
  const sender = useSender();
  const problemId = useId();
  const use = (id: Id) => {
    const command = startUsingPackageCommand(project, id, viewId);
    if (command) void sender.send(command);
  };
  return (
    <li>
      {open ? (
        <button
          type="button"
          className="inspector-selectable"
          onClick={() => open({ kind: 'package', id: file.id }, { focus: true })}
        >
          <span className="item-name inspector-selectable-name">{file.name}</span>
        </button>
      ) : (
        <span className="item-name">{file.name}</span>
      )}
      <button
        type="button"
        className="components-use"
        aria-label={`Use the package “${file.name}”`}
        aria-describedby={sender.problem === undefined ? undefined : problemId}
        disabled={send === undefined}
        onClick={() => use(file.id)}
      >
        Use
      </button>
      {file.description !== undefined && <span className="item-notes">{file.description}</span>}
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
    </li>
  );
}
