/**
 * Copy address, in the header: copies the view address of the view state as it is now (ADR-0030's
 * addendum of 2026-10-25), and says so. The address holds no secret: pasted into a tab that has the
 * project open, or opened by a reload, it opens the project at that view state. When the browser
 * will not copy, a notice shows the address so that it can be copied by hand.
 */
import { MAX_VIEW_STATE_IDS } from '@visual-anything/core';
import { useContext, useState } from 'react';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import { LinkIcon } from '../shell/icons';
import type { ViewStateLink } from './useViewState';
import './view-state.css';

/** The notice when the browser will not copy, which the notices translate (ADR-0038). */
const NOT_COPIED = 'Could not copy the address, so here it is to copy by hand: {address}';

/** What the clipboard is reached through: the browser's by default. */
export type WriteText = (text: string) => Promise<void>;

function browserClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
    return Promise.reject(new Error('This browser has no clipboard here.'));
  }
  return navigator.clipboard.writeText(text);
}

export function CopyAddress({
  link,
  writeText = browserClipboard,
}: {
  link: ViewStateLink;
  writeText?: WriteText;
}) {
  const t = useT();
  const live = useContext(LiveContext);
  // Each message counts, so that the same words said again are heard again.
  const [said, setSaid] = useState({ text: '', count: 0 });
  const say = (text: string) => setSaid((last) => ({ text, count: last.count + 1 }));

  const copy = async () => {
    const now = link.address();
    if (now === undefined) return;
    try {
      await writeText(now.address);
      say(
        now.selectionLeftOut
          ? t(
              'Address copied, without the selection: an address holds at most {max} selected things.',
              { max: MAX_VIEW_STATE_IDS },
            )
          : t('Address copied.'),
      );
    } catch {
      live?.notify('warning', NOT_COPIED.replace('{address}', now.address));
    }
  };

  return (
    <>
      <button
        type="button"
        className="copy-address"
        title={t(
          'Copy an address that opens this view where it is: its camera, selection, filters, focus and scenario step',
        )}
        onClick={() => void copy()}
      >
        <LinkIcon />
        <span>{t('Copy address')}</span>
      </button>
      <span className="visually-hidden" aria-live="polite">
        {said.text}
        {said.count % 2 === 1 ? ' ' : ''}
      </span>
    </>
  );
}
