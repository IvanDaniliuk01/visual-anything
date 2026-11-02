import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type MouseEvent,
} from 'react';
import type { Notice, NoticeLevel } from '../live/connection';
import { useT } from '../i18n';
import { useLive } from '../live/context';
import { CopyIcon, DismissIcon, WarningIcon } from './icons';
import { noticeList, type NoticeList } from './noticeList';

/** How long info stays before it goes by itself; warnings and errors stay until dismissed. */
const INFO_TIMEOUT_MS = 6_000;

/** How long Copy says it copied, before it says Copy again. */
const COPIED_MS = 2_000;

function subscribeToVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => {
    document.removeEventListener('visibilitychange', onChange);
  };
}

function isTabVisible(): boolean {
  return document.visibilityState === 'visible';
}

const LEVEL_LABELS: Record<NoticeLevel, string | undefined> = {
  info: undefined,
  warning: 'Warning:',
  error: 'Error:',
};

/** A notice as shown: the same notice sent again while it shows is shown once, and goes with it. */
interface ShownNotice extends Notice {
  ids: readonly number[];
}

function shownOnce(notices: readonly Notice[]): ShownNotice[] {
  const shown = new Map<string, ShownNotice>();
  for (const notice of notices) {
    const key = `${notice.level}\n${notice.message}`;
    const same = shown.get(key);
    shown.set(
      key,
      same ? { ...same, ids: [...same.ids, notice.id] } : { ...notice, ids: [notice.id] },
    );
  }
  return [...shown.values()];
}

/**
 * The live session's notices, stacked in a corner with the newest nearest it. Each is announced as it
 * appears: info and warnings politely, errors at once. A burst of warnings from one cause is summed up
 * in one short notice, "29 warnings · Show", whose Show lists them (A5).
 */
export function Notices() {
  const { notices, dismiss } = useLive();
  if (notices.length === 0) return null;
  return (
    <div className="notices">
      {shownOnce(notices).map((notice) => (
        <NoticeItem key={notice.id} notice={notice} dismiss={dismiss} />
      ))}
    </div>
  );
}

interface NoticeItemProps {
  notice: ShownNotice;
  dismiss: (id: number) => void;
}

/**
 * One notice. Info goes by itself after a while, but not while the pointer or the focus is on it, nor
 * while the tab is hidden, so that nobody misses it. A long one takes a few lines and scrolls within
 * them.
 */
function NoticeItem({ notice, dismiss: dismissOne }: NoticeItemProps) {
  const t = useT();
  const { level, message } = notice;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const visible = useSyncExternalStore(subscribeToVisibility, isTabVisible);
  const held = hovered || focused || !visible;
  const list = noticeList(notice);
  const dismiss = useEffectEvent(() => {
    for (const id of notice.ids) dismissOne(id);
  });

  useEffect(() => {
    if (level !== 'info' || held) return;
    const timer = window.setTimeout(() => {
      dismiss();
    }, INFO_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [level, held]);

  const onDismiss = (event: MouseEvent<HTMLButtonElement>) => {
    // Dismissed from the keyboard: keep the focus among the notices instead of losing it.
    const button = event.currentTarget;
    if (button === document.activeElement) {
      const item = button.closest('.notice');
      const neighbour = item?.nextElementSibling ?? item?.previousElementSibling;
      neighbour?.querySelector<HTMLButtonElement>('.notice-dismiss')?.focus();
    }
    for (const id of notice.ids) dismissOne(id);
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node && event.currentTarget.contains(next))) setFocused(false);
  };

  const label = LEVEL_LABELS[level];
  return (
    <div
      className={list ? `notice notice-${level} notice-summed` : `notice notice-${level}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      {list ? (
        <SummedWarnings list={list} />
      ) : (
        // Only the message is a live region, so the button is not announced with it.
        <p className="notice-message" role={level === 'error' ? 'alert' : 'status'}>
          {label !== undefined && (
            <>
              <strong className="notice-level">{t(label)}</strong>{' '}
            </>
          )}
          {t.message(message)}
        </p>
      )}
      <button
        type="button"
        className="notice-dismiss"
        aria-label={t('Dismiss')}
        onClick={onDismiss}
      >
        <DismissIcon />
      </button>
    </div>
  );
}

/**
 * A burst of warnings, summed up: how many, and Show, which opens them under it as a list to read and
 * copy, its heading first.
 */
function SummedWarnings({ list }: { list: NoticeList }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'yes' | 'failed'>();
  const listId = useId();
  const items = useRef<HTMLOListElement>(null);
  const heading = t.message(list.heading);
  const lines = list.items.map((item) => t.message(item));

  useEffect(() => {
    if (copied !== 'yes') return;
    const timer = window.setTimeout(() => setCopied(undefined), COPIED_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText([heading, ...lines].join('\n'));
      setCopied('yes');
    } catch {
      // The browser would not copy: the list is selected, for the person to copy themselves.
      const selection = window.getSelection();
      if (items.current && selection) selection.selectAllChildren(items.current);
      setCopied('failed');
    }
  };

  return (
    <div className="notice-body">
      <div className="notice-summary">
        <WarningIcon className="notice-icon" />
        {/* Only how many is a live region, so Show is not announced with it. */}
        <p className="notice-message" role="status" title={heading}>
          <span className="visually-hidden">{t('Warning:')} </span>
          {t({ one: '{count} warning', other: '{count} warnings' }, { count: list.items.length })}
        </p>
        <span className="notice-dot" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          className="notice-action"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((last) => !last)}
        >
          {open ? t('Hide') : t('Show')}
        </button>
      </div>
      {open && (
        <section id={listId} className="notice-list" aria-label={heading}>
          <div className="notice-list-head">
            <h2 className="notice-list-heading">{heading}</h2>
            <button type="button" className="notice-action" onClick={() => void copy()}>
              <CopyIcon />
              {copied === 'yes' ? t('Copied') : t('Copy')}
            </button>
          </div>
          {copied === 'failed' && (
            <p className="notice-list-note" role="status">
              {t('Could not copy: the list is selected, to copy it with Ctrl+C or ⌘C.')}
            </p>
          )}
          <ol ref={items} className="notice-list-items">
            {lines.map((line, at) => (
              <li key={at}>{line}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
