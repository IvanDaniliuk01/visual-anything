/**
 * Compare with…, in the header (ADR 0070): a button that opens the dialog of versions, and what
 * shows the comparison chosen on the canvas, with the Changes tab, as compared with the project now,
 * which it follows. Claude's guidance `comparison` takes the same path, as if the person had chosen
 * the version: in the tab the person used last, it opens the view it names, asks the program for the
 * version, and shows it; why it could not is a notice.
 */
import type { ListedVersion } from '@visual-anything/core';
import { useContext, useEffect, useRef, useState } from 'react';
import { useShowComparison } from '../canvas/comparison/mode';
import { EditorContext } from '../editor/EditorContext';
import { inTheTabUsedLast } from '../guidance/tabs';
import { useT } from '../i18n';
import { fill } from '../i18n/translate';
import { LiveContext } from '../live/context';
import { CompareIcon } from '../shell/icons';
import { CompareDialog } from './CompareDialog';
import { useAsking, type CompareSession } from './session';
import { OPENED, versionName, type ChosenVersion } from './versions';
import './versions.css';

/** The notice when the version Claude named could not be compared, which the notices translate. */
const GUIDED_REFUSED = 'Could not compare with the version Claude named: {why}';

interface CompareControlProps {
  /** The tab's Compare with…: what it asks for, and the versions it heard listed. */
  session: CompareSession;
}

export function CompareControl({ session }: CompareControlProps) {
  const t = useT();
  const live = useContext(LiveContext);
  const editor = useContext(EditorContext);
  const show = useShowComparison();
  const asking = useAsking(session);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const connected = live?.status === 'open';
  const ask = connected ? live.compareVersion : undefined;
  const list = connected ? live.listVersions : undefined;
  const available = ask !== undefined && list !== undefined && show !== undefined;

  const close = () => {
    session.cancel();
    setOpen(false);
    opener.current?.focus();
  };

  const choose = (chosen: ChosenVersion) => {
    if (!ask || !show) return;
    void session.compare(chosen, { ask, show, t }).then((outcome) => {
      if (outcome !== 'shown') return;
      setOpen(false);
      opener.current?.focus();
    });
  };

  // Claude's guidance asks once for each request, in the tab the person used last only, so that one
  // version is read at a time.
  const guided = live?.guidance?.comparison;
  const applied = useRef<number | undefined>(undefined);
  const notify = live?.notify;
  useEffect(() => {
    if (!guided || applied.current === guided.request || !ask || !show) return;
    applied.current = guided.request;
    if (!inTheTabUsedLast(guided)) return;
    const { view } = guided;
    if (
      view !== undefined &&
      view !== editor?.viewId &&
      editor?.project.views.some((each) => each.id === view)
    ) {
      editor.openView?.(view);
    }
    const chosen = guided.version.kind === 'opened' ? OPENED : session.named(guided.version.commit);
    void session
      .compare(chosen, { ask, show, t, ...(guided.show ? { drawing: guided.show } : {}) })
      .then((outcome) => {
        const said = session.get();
        if (outcome !== 'refused' || said?.state !== 'refused') return;
        session.cancel();
        notify?.(
          'error',
          fill(GUIDED_REFUSED, { why: said.problems.map((each) => each.message).join(' ') }),
        );
      });
  }, [guided, ask, show, editor, session, t, notify]);

  // While Claude's version is read, outside the dialog, the button says so.
  const waitingHere = !open && asking?.state === 'waiting';
  const tooltip = !available
    ? t('Visual Anything is not connected')
    : waitingHere
      ? t('Reading {version} to compare it with the project now…', {
          version: versionName(t, asking.chosen),
        })
      : t('Compare the project now with another version of it');

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="compare-button"
        aria-haspopup="dialog"
        aria-disabled={available ? undefined : true}
        aria-busy={waitingHere ? true : undefined}
        title={tooltip}
        onClick={available ? () => setOpen(true) : undefined}
      >
        <CompareIcon />
        <span className="compare-label">{waitingHere ? t('Comparing…') : t('Compare with…')}</span>
      </button>
      {/* Only while Claude's version is read, so that the header holds no live region of its own. */}
      {waitingHere && (
        <span className="visually-hidden" role="status">
          {tooltip}
        </span>
      )}
      {open && list && (
        <CompareDialog
          list={list}
          onListed={(versions: readonly ListedVersion[]) => session.listed(versions)}
          asking={asking}
          onChoose={choose}
          onClose={close}
        />
      )}
    </>
  );
}
