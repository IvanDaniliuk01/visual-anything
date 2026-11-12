/**
 * The approval of an explorable (ADR 0107), whose dialog every explorable shows before it runs, the
 * ones Claude writes included. It names the explorable and what it explains; who wrote it, Claude in
 * this session or from outside (an import, git, the person's own editor); its script libraries, each
 * with its version, license and size; its code, behind Show code; and the one plain sentence on what
 * the frame cannot do and what no browser lets anyone block fully. Approving keeps the hash of its
 * text and its script libraries in the person's preferences, never in the project.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { isApproved } from '@visual-anything/core';
import { useContext, useId, useMemo, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import { explorableOf } from './explorable';
import { libraryLine } from './words';
import { useExplorableApprovals } from './hooks';
import { useExplorableSession } from './session';
import '../code/code.css';
import './explorables.css';

/** The dialog of the explorable being reviewed, while one is; nothing otherwise. */
export function ExplorableApproval({ project }: { project: ProjectSnapshot }) {
  const session = useExplorableSession();
  const reviewing = session?.snapshot().reviewing;
  if (!session || reviewing === undefined) return null;
  return (
    <ExplorableApprovalDialog
      key={reviewing}
      project={project}
      explorable={reviewing}
      onClose={() => session.review(undefined)}
    />
  );
}

export function ExplorableApprovalDialog({
  project,
  explorable,
  onClose,
}: {
  project: ProjectSnapshot;
  explorable: string;
  onClose: () => void;
}) {
  const t = useT();
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog);
  const titleId = useId();
  const session = useExplorableSession();
  const { approvals, approve, revoke } = useExplorableApprovals();
  const authors = useContext(LiveContext)?.explorableAuthors;
  const shown = useMemo(() => explorableOf(project, explorable), [project, explorable]);
  // What the person read: a text that changes while the dialog is open approves nothing.
  const [reviewed, setReviewed] = useState(shown?.hash);
  if (!shown) return null;
  const { definition } = shown;
  const hash = shown.hash;
  const changed = reviewed !== hash;
  const approved = hash !== undefined && isApproved(approvals, hash);
  const byClaude = authors?.get(shown.id) === 'claude';
  const runnable = hash !== undefined && shown.text !== undefined;
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog explorable-approval"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2 id={titleId}>
          {approved
            ? t('The explorable “{name}”', { name: definition.name })
            : t('Run the explorable “{name}”?', { name: definition.name })}
        </h2>
        {changed && (
          <p className="inspector-warning" role="alert">
            {t(
              'It changed while it was open here: this is it as it is now, and nothing was approved.',
            )}
          </p>
        )}
        {definition.description !== undefined && definition.description.trim() !== '' && (
          <p>{definition.description}</p>
        )}
        <p className="dialog-note">
          {byClaude
            ? t('Claude wrote it, in this session.')
            : t('It came from outside: an import, git or your own editor.')}
        </p>
        <p>
          {t(
            'It runs walled off: it cannot see your files, this session or the network. The one thing no browser lets anyone block fully is sending data out over WebRTC, so approve it only if you trust whoever wrote it.',
          )}
        </p>
        {shown.libraries.length > 0 ? (
          <>
            <p className="dialog-note">{t('The script libraries it uses:')}</p>
            <ul className="explorable-approval-libraries">
              {shown.libraries.map((library) => (
                <li key={library.id}>{libraryLine(t, library)}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="dialog-note">{t('It uses no script library.')}</p>
        )}
        {shown.text === undefined ? (
          <p className="inspector-warning">
            {t('Its file in explorables/ is missing, or past 512 KiB, so it never runs.')}
          </p>
        ) : (
          <details className="explorable-approval-code">
            <summary>{t('Show code')}</summary>
            <pre className="code-approval-text" tabIndex={0} aria-label={t('Its code')}>
              <code>{shown.text}</code>
            </pre>
          </details>
        )}
        {hash !== undefined && (
          <p className="dialog-note">
            <span title={hash}>{t('hash {hash}…', { hash: hash.slice(0, 12) })}</span>
          </p>
        )}
        <div className="dialog-actions">
          {approved && (
            <button
              type="button"
              onClick={() => {
                revoke(hash);
                onClose();
              }}
            >
              {t('Withdraw approval')}
            </button>
          )}
          <button type="button" onClick={onClose}>
            {approved ? t('Close') : t('Cancel')}
          </button>
          {!approved && runnable && (
            <button
              type="button"
              className="dialog-confirm"
              onClick={() => {
                if (changed) {
                  setReviewed(hash);
                  return;
                }
                approve(hash, shown.id);
                session?.run(hash);
                onClose();
              }}
            >
              {t('Approve and run')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
