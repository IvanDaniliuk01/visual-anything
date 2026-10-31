/**
 * The conflicts of every file in the Changes tab (ADR 0072), whenever the project holds any: each file
 * with its conflicts, each conflict with what it is about, why the merge could not join it, what the
 * file keeps and the other choice. Show draws it on the canvas as a comparison between what is kept
 * and the other choice; Keep and Take the other resolve it, one at a time or for the whole file, as
 * the person's action, which undo takes back. Taking the other choice where it deletes previews the
 * deletion first. With a file's last conflict, the note that the file can now be added with git.
 */
import { previewDelete, type DeleteTargets, type ProjectSnapshot } from '@visual-anything/core';
import type { FileConflict } from '@visual-anything/schema';
import { useContext, useId, useRef, useState } from 'react';
import { DeleteDialog } from '../../canvas/DeleteDialog';
import { ComparisonContext, type ComparisonHandle } from '../../canvas/comparison/mode';
import { EditorContext } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { LiveContext } from '../../live/context';
import {
  conflictChoice,
  conflictedFiles,
  keptValue,
  removalsOf,
  resolveCommand,
  valueSnippet,
  type ConflictedFile,
} from './conflicts';
import { ConflictsContext, useResolvedNotes } from './store';
import { conflictTitle, conflictsText, fileTitle, sideName, whyText } from './text';
import './conflicts.css';

/** A choice the person asked for, while it waits for the deletion's preview to be confirmed. */
interface Asked {
  file: ConflictedFile;
  conflicts: readonly FileConflict[];
  targets: DeleteTargets;
}

export function ConflictsSection() {
  const t = useT();
  const heading = useId();
  const editor = useContext(EditorContext);
  const store = useContext(ConflictsContext);
  const comparisons = useContext(ComparisonContext);
  const live = useContext(LiveContext);
  // The conflict this section drew on the canvas, if it still shows.
  const drawn = useRef<ComparisonHandle | undefined>(undefined);
  const project = editor?.project;
  const notes = useResolvedNotes(project);
  const [problems, setProblems] = useState<{ key: string; text: string }>();
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<Asked>();
  if (!project) return null;
  const files = conflictedFiles(project);
  if (files.length === 0 && notes.length === 0) return null;
  // The person's action, sent where the canvas could edit, answered with why it was refused if it was.
  const send = editor.send && live?.status === 'open' ? live.send : undefined;
  const usable = send !== undefined && !busy;

  /** Resolves some of a file's conflicts, and notes it once the file holds none. */
  const resolve = async (
    file: ConflictedFile,
    conflicts: readonly FileConflict[],
    take: 'kept' | 'other',
    key: string,
  ) => {
    if (!send) return;
    setBusy(true);
    setProblems(undefined);
    try {
      const result = await send(resolveCommand(file.file, conflicts, take));
      if (!result.ok) {
        setProblems({
          key,
          text: result.problems.map((each) => t.message(each.message)).join(' '),
        });
        return;
      }
      // A conflict drawn on the canvas is one the file may no longer hold.
      drawn.current?.end();
      drawn.current = undefined;
      if (conflicts.length === file.conflicts.length) {
        store?.resolved({ key: file.key, title: fileTitle(t, file) });
      }
    } finally {
      setBusy(false);
    }
  };

  /** Takes the other choice, after the preview of what it deletes, if it deletes anything. */
  const takeOther = (file: ConflictedFile, conflicts: readonly FileConflict[], key: string) => {
    const targets = removalsOf(file.file, conflicts, project);
    if (targets) setAsked({ file, conflicts, targets });
    else void resolve(file, conflicts, 'other', key);
  };

  /** Draws a conflict on the canvas: what the file keeps, and the other choice. */
  const show = (file: ConflictedFile, conflict: FileConflict, key: string) => {
    if (!comparisons) return;
    const choice = conflictChoice(project, file.file, [conflict]);
    if (!choice.ok) {
      setProblems({
        key,
        text: t('The other choice cannot be taken now: {why}', {
          why: choice.problems.map((each) => t.message(each.message)).join(' '),
        }),
      });
      return;
    }
    setProblems(undefined);
    if (file.file.kind === 'view' && file.file.id !== editor.viewId)
      editor.openView?.(file.file.id);
    drawn.current = comparisons.showComparison({
      older: choice.kept,
      newer: choice.other,
      comparison: choice.comparison,
      title: t('{what}: what is kept, and the other choice', {
        what: conflictTitle(t, project, file, conflict),
      }),
      follows: false,
    });
  };

  return (
    <section className="conflicts" aria-labelledby={heading}>
      <h3 id={heading} className="changes-title">
        {t('Conflicts from a merge')}
      </h3>
      {notes.map((note) => (
        <p key={note.key} className="conflicts-note" role="status">
          <span>
            {t('{file} holds no conflict now: its file can be added with git add.', {
              file: note.title,
            })}
          </span>
          <button type="button" onClick={() => store?.dismiss(note.key)}>
            {t('Dismiss')}
          </button>
        </p>
      ))}
      {files.map((file) => (
        <section key={file.key} className="conflicts-file" aria-label={fileTitle(t, file)}>
          <h4 className="conflicts-file-title">
            {fileTitle(t, file)}
            <span className="conflicts-count">{conflictsText(t, file.conflicts.length)}</span>
          </h4>
          <div className="conflicts-actions">
            <button
              type="button"
              aria-disabled={usable ? undefined : true}
              onClick={
                usable ? () => void resolve(file, file.conflicts, 'kept', file.key) : undefined
              }
            >
              {t('Keep all')}
            </button>
            <button
              type="button"
              aria-disabled={usable ? undefined : true}
              onClick={usable ? () => takeOther(file, file.conflicts, file.key) : undefined}
            >
              {t('Take the other for all')}
            </button>
          </div>
          {problems?.key === file.key && (
            <p className="conflicts-problems" role="alert">
              {problems.text}
            </p>
          )}
          <ul className="conflicts-list">
            {file.conflicts.map((conflict) => {
              const key = `${file.key} ${conflict.id}`;
              return (
                <ConflictItem
                  key={conflict.id}
                  project={project}
                  file={file}
                  conflict={conflict}
                  usable={usable}
                  problems={problems?.key === key ? problems.text : undefined}
                  onShow={() => show(file, conflict, key)}
                  onKeep={() => void resolve(file, [conflict], 'kept', key)}
                  onTakeOther={() => takeOther(file, [conflict], key)}
                />
              );
            })}
          </ul>
        </section>
      ))}
      {asked && (
        <DeleteDialog
          project={project}
          preview={previewDelete(project, asked.targets, editor.viewId)}
          freeShapes={0}
          onCancel={() => setAsked(undefined)}
          onConfirm={() => {
            setAsked(undefined);
            const key =
              asked.conflicts.length === 1
                ? `${asked.file.key} ${asked.conflicts[0]?.id ?? ''}`
                : asked.file.key;
            void resolve(asked.file, asked.conflicts, 'other', key);
          }}
        />
      )}
    </section>
  );
}

interface ConflictItemProps {
  project: ProjectSnapshot;
  file: ConflictedFile;
  conflict: FileConflict;
  usable: boolean;
  problems: string | undefined;
  onShow: () => void;
  onKeep: () => void;
  onTakeOther: () => void;
}

/** One conflict: what it is about, why, what is kept and the other choice, and what to do. */
function ConflictItem({
  project,
  file,
  conflict,
  usable,
  problems,
  onShow,
  onKeep,
  onTakeOther,
}: ConflictItemProps) {
  const t = useT();
  const title = conflictTitle(t, project, file, conflict);
  const kept = valueSnippet(keptValue(file, conflict));
  const other = valueSnippet(conflict.other);
  return (
    <li className="conflict" aria-label={title}>
      <p className="conflict-title">{title}</p>
      <p className="conflict-why">{whyText(t, conflict.why)}</p>
      <dl className="conflict-values">
        <dt>{t('Kept, from {side}', { side: sideName(t, conflict, 'kept') })}</dt>
        <dd>{kept === '' ? <em>{t('Nothing: it is removed.')}</em> : <code>{kept}</code>}</dd>
        <dt>{t('The other choice, from {side}', { side: sideName(t, conflict, 'other') })}</dt>
        <dd>
          {conflict.other === undefined ? (
            <em>{t('Taking it removes this.')}</em>
          ) : (
            <code>{other}</code>
          )}
        </dd>
      </dl>
      <div className="conflicts-actions">
        <button type="button" onClick={onShow}>
          {t('Show')}
        </button>
        <button
          type="button"
          aria-disabled={usable ? undefined : true}
          onClick={usable ? onKeep : undefined}
        >
          {t('Keep')}
        </button>
        <button
          type="button"
          aria-disabled={usable ? undefined : true}
          onClick={usable ? onTakeOther : undefined}
        >
          {t('Take the other')}
        </button>
      </div>
      {problems !== undefined && (
        <p className="conflicts-problems" role="alert">
          {problems}
        </p>
      )}
    </li>
  );
}
