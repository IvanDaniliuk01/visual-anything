/**
 * The history panel (R28): the actions the local program keeps (ADR-0028), newest first, each with its
 * label, who did it and when, and whether it is undone. "Undo to here" undoes every action after one
 * and that one too, whoever did each, one action at a time; "Redo to here" redoes up to one. Claude's
 * actions say so in words and with a mark, never by color alone.
 *
 * The list is one tab stop: the arrow keys, Home and End move between its actions. While it shows, it
 * says each action added, and who did it.
 */
import type { ListedAction } from '@visual-anything/core';
import { useContext, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useT, type Translator } from '../i18n';
import { LiveContext, type Live } from '../live/context';
import { ReviewSetting } from '../proposals/ReviewSetting';
import { SparklesIcon } from '../shell/icons';
import './history.css';
import { actionTime, useToday } from './time';

interface HistoryPanelProps {
  /** Whether the panel shows; it says what is added only while it does. */
  active: boolean;
}

export function HistoryPanel({ active }: HistoryPanelProps) {
  const t = useT();
  const live = useContext(LiveContext);
  if (live === null) {
    return (
      <p className="panel-empty">{t('The history shows while Visual Anything is connected.')}</p>
    );
  }
  return <HistoryList live={live} active={active} />;
}

const NO_ACTIONS: readonly ListedAction[] = [];

function HistoryList({ live, active }: { live: Live; active: boolean }) {
  const t = useT();
  const base = useId();
  const actions = live.actions ?? NO_ACTIONS;
  // Newest first: the actions undone furthest from now on top, then the newest done.
  const shown = useMemo(() => actions.toReversed(), [actions]);
  const added = useAdded(actions);
  const [focused, setFocused] = useState<number>();
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const waiting = useRef(false);
  const [busy, setBusy] = useState(false);
  const connected = live.status === 'open';
  const usable = connected && !busy;
  // The tab stop: the action last focused, or else the newest one done.
  const stop = shown.some((each) => each.id === focused)
    ? focused
    : (shown.find((each) => !each.undone) ?? shown[0])?.id;
  const today = useToday();

  async function goTo(action: ListedAction): Promise<void> {
    const ask = action.undone ? live.redoTo : live.undoTo;
    if (waiting.current || !connected || ask === undefined) return;
    waiting.current = true;
    setBusy(true);
    try {
      await ask(action.id);
    } finally {
      waiting.current = false;
      setBusy(false);
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const at = shown.findIndex(
      (each) => buttons.current.get(each.id) === event.currentTarget.ownerDocument.activeElement,
    );
    if (at < 0) return;
    const next =
      event.key === 'ArrowDown'
        ? shown[Math.min(at + 1, shown.length - 1)]
        : event.key === 'ArrowUp'
          ? shown[Math.max(at - 1, 0)]
          : event.key === 'Home'
            ? shown[0]
            : event.key === 'End'
              ? shown.at(-1)
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setFocused(next.id);
    buttons.current.get(next.id)?.focus();
  };

  return (
    <div className="history-panel">
      <ReviewSetting />
      {shown.length === 0 ? (
        <p className="panel-empty">
          {t(
            'Nothing is done yet. What you and Claude change shows here, newest first, and can be undone from here, many actions at once.',
          )}
        </p>
      ) : (
        <ol className="history-list" aria-label={t('Actions, newest first')} onKeyDown={onKeyDown}>
          {shown.map((action) => {
            const ids = {
              button: `${base}-${action.id}-button`,
              label: `${base}-${action.id}-label`,
              about: `${base}-${action.id}-about`,
            };
            return (
              <li
                key={action.id}
                className="history-item"
                data-author={action.author}
                data-undone={action.undone ? 'true' : undefined}
              >
                <div className="history-item-text">
                  <span id={ids.label} className="history-item-label">
                    {t.message(action.label)}
                  </span>
                  <span id={ids.about} className="history-item-about">
                    <Author author={action.author} />
                    <span className="visually-hidden">, </span>
                    <time dateTime={new Date(action.time).toISOString()}>
                      {actionTime(action.time, today, t.language)}
                    </time>
                    {action.undone && (
                      <>
                        <span className="visually-hidden">, </span>
                        <span className="history-item-undone">{t('Undone')}</span>
                      </>
                    )}
                  </span>
                </div>
                <button
                  ref={(element) => {
                    if (element) buttons.current.set(action.id, element);
                    else buttons.current.delete(action.id);
                  }}
                  id={ids.button}
                  type="button"
                  className="history-item-button"
                  aria-labelledby={`${ids.button} ${ids.label}`}
                  aria-describedby={ids.about}
                  aria-disabled={usable ? undefined : true}
                  title={connected ? undefined : t('Visual Anything is not connected')}
                  tabIndex={action.id === stop ? 0 : -1}
                  onFocus={() => setFocused(action.id)}
                  onClick={() => void goTo(action)}
                >
                  {action.undone ? t('Redo to here') : t('Undo to here')}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <p className="visually-hidden" role="status">
        {active && added !== undefined ? addedText(t, added) : ''}
      </p>
    </div>
  );
}

/** Who did an action: Claude, in words and with its mark, or the person. */
function Author({ author }: { author: ListedAction['author'] }) {
  const t = useT();
  return author === 'claude' ? (
    <span className="history-item-author history-item-claude">
      <SparklesIcon size={12} />
      Claude
    </span>
  ) : (
    <span className="history-item-author">{t('You')}</span>
  );
}

function addedText(t: Translator, action: ListedAction): string {
  const label = t.message(action.label);
  return action.author === 'claude'
    ? t('{action}, by Claude', { action: label })
    : t('{action}, by you', { action: label });
}

/**
 * The newest action added to the history since the panel first saw it: none for the history it opened
 * with, or the one it got on connecting, and none for an undo or a redo.
 */
function useAdded(actions: readonly ListedAction[] | undefined): ListedAction | undefined {
  const [seen, setSeen] = useState<{ newest: number; added?: ListedAction } | undefined>();
  const newest = actions?.reduce((most, each) => Math.max(most, each.id), 0);
  if (actions !== undefined && newest !== undefined) {
    if (seen === undefined) setSeen({ newest });
    else if (newest > seen.newest) {
      const added = actions.find((each) => each.id === newest && !each.undone);
      setSeen(added === undefined ? { ...seen, newest } : { newest, added });
    }
  }
  return seen?.added;
}
