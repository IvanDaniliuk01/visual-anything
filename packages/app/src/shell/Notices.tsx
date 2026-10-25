import { useEffect, useState, useSyncExternalStore, type FocusEvent, type MouseEvent } from 'react';
import type { Notice, NoticeLevel } from '../live/connection';
import { useT } from '../i18n';
import { useLive } from '../live/context';

/** How long info stays before it goes by itself; warnings and errors stay until dismissed. */
const INFO_TIMEOUT_MS = 6_000;

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

/**
 * The live session's notices, stacked in a corner with the newest nearest it. Each is announced as it
 * appears: info and warnings politely, errors at once.
 */
export function Notices() {
  const { notices, dismiss } = useLive();
  if (notices.length === 0) return null;
  return (
    <div className="notices">
      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} dismiss={dismiss} />
      ))}
    </div>
  );
}

interface NoticeItemProps {
  notice: Notice;
  dismiss: (id: number) => void;
}

/**
 * One notice. Info goes by itself after a while, but not while the pointer or the focus is on it, nor
 * while the tab is hidden, so that nobody misses it.
 */
function NoticeItem({ notice, dismiss }: NoticeItemProps) {
  const t = useT();
  const { id, level, message } = notice;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const visible = useSyncExternalStore(subscribeToVisibility, isTabVisible);
  const held = hovered || focused || !visible;

  useEffect(() => {
    if (level !== 'info' || held) return;
    const timer = window.setTimeout(() => {
      dismiss(id);
    }, INFO_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [id, level, held, dismiss]);

  const onDismiss = (event: MouseEvent<HTMLButtonElement>) => {
    // Dismissed from the keyboard: keep the focus among the notices instead of losing it.
    const button = event.currentTarget;
    if (button === document.activeElement) {
      const item = button.closest('.notice');
      const neighbour = item?.nextElementSibling ?? item?.previousElementSibling;
      neighbour?.querySelector<HTMLButtonElement>('.notice-dismiss')?.focus();
    }
    dismiss(id);
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node && event.currentTarget.contains(next))) setFocused(false);
  };

  const label = LEVEL_LABELS[level];
  return (
    <div
      className={`notice notice-${level}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      {/* Only the message is a live region, so the button is not announced with it. */}
      <p className="notice-message" role={level === 'error' ? 'alert' : 'status'}>
        {label !== undefined && (
          <>
            <strong className="notice-level">{t(label)}</strong>{' '}
          </>
        )}
        {t.message(message)}
      </p>
      <button
        type="button"
        className="notice-dismiss"
        aria-label={t('Dismiss')}
        onClick={onDismiss}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
