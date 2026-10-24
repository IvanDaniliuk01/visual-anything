import type { HistorySummary } from '@visual-anything/core';
import { useContext, useEffect, useEffectEvent, useRef } from 'react';
import { LiveContext, type Live } from '../live/context';
import { IS_APPLE } from '../live/platform';
import { historyShortcut, isTextEntry, type HistoryAction } from '../live/shortcuts';

interface HeaderProps {
  /** The open project's name; absent until a project is open. */
  projectName?: string | undefined;
  /** The open view's name; absent when no view is open. */
  viewName?: string | undefined;
}

/**
 * The header: the product name, then the open project and view. While a project is open in a live
 * session, it also holds undo and redo.
 */
export function Header({ projectName, viewName }: HeaderProps) {
  const live = useContext(LiveContext);
  return (
    <header className="shell-header">
      <h1 className="shell-product">Visual Anything</h1>
      {projectName !== undefined && (
        <dl className="shell-context">
          <div>
            <dt>Project</dt>
            <dd>{projectName}</dd>
          </div>
          {viewName !== undefined && (
            <div>
              <dt>View</dt>
              <dd>{viewName}</dd>
            </div>
          )}
        </dl>
      )}
      {projectName !== undefined && live !== null && <HistoryControls live={live} />}
    </header>
  );
}

/** An action the history could undo or redo. */
type HistoryStep = NonNullable<HistorySummary['undo']>;

const VERBS: Record<HistoryAction, string> = { undo: 'Undo', redo: 'Redo' };

const SHORTCUTS: Record<HistoryAction, { keys: string; shown: string }> = {
  undo: { keys: 'Control+Z Meta+Z', shown: IS_APPLE ? '⌘Z' : 'Ctrl+Z' },
  redo: { keys: 'Control+Shift+Z Meta+Shift+Z Control+Y', shown: IS_APPLE ? '⌘⇧Z' : 'Ctrl+Y' },
};

/** What a history button is called: "Undo: Rename …", or "Undo Claude’s action: Rename …". */
function nameOf(action: HistoryAction, step: HistoryStep | undefined): string {
  const verb = VERBS[action];
  if (step === undefined) return verb;
  return step.author === 'claude'
    ? `${verb} Claude’s action: ${step.label}`
    : `${verb}: ${step.label}`;
}

/**
 * Undo and redo, as buttons and as keyboard shortcuts. Each button names the action it would undo or
 * redo, and says when Claude did it. One undo or redo is sent at a time: the next waits for the
 * answer, so that holding a shortcut down does not queue more than the history holds.
 */
function HistoryControls({ live }: { live: Live }) {
  const connected = live.status === 'open';
  const waiting = useRef(false);

  const available = (action: HistoryAction) => connected && live.history[action] !== undefined;

  async function perform(action: HistoryAction): Promise<void> {
    if (waiting.current || !available(action)) return;
    waiting.current = true;
    try {
      await (action === 'undo' ? live.undo() : live.redo());
    } finally {
      waiting.current = false;
    }
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // Typing keeps its own undo, and a shortcut something else handled is not ours.
    if (event.defaultPrevented || event.isComposing || isTextEntry(event.target)) return;
    const action = historyShortcut(event);
    if (action === undefined) return;
    event.preventDefault();
    void perform(action);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      onKeyDown(event);
    };
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, []);

  return (
    <div className="shell-history" role="group" aria-label="Undo history">
      {(['undo', 'redo'] as const).map((action) => (
        <HistoryButton
          key={action}
          action={action}
          step={live.history[action]}
          available={available(action)}
          connected={connected}
          onPress={() => void perform(action)}
        />
      ))}
    </div>
  );
}

interface HistoryButtonProps {
  action: HistoryAction;
  step: HistoryStep | undefined;
  available: boolean;
  connected: boolean;
  onPress: () => void;
}

/**
 * One of undo and redo. When it has nothing to do it is marked disabled but stays focusable, so the
 * focus stays on it when the last action is undone.
 */
function HistoryButton({ action, step, available, connected, onPress }: HistoryButtonProps) {
  const name = nameOf(action, step);
  const shortcut = SHORTCUTS[action];
  const tooltip = available
    ? `${name} (${shortcut.shown})`
    : connected
      ? `Nothing to ${action}`
      : 'Visual Anything is not connected';
  return (
    <button
      type="button"
      className="history-button"
      aria-label={name}
      title={tooltip}
      aria-disabled={available ? undefined : true}
      aria-keyshortcuts={shortcut.keys}
      onClick={available ? onPress : undefined}
    >
      <span className="history-verb">{VERBS[action]}</span>
      {step !== undefined && <span className="history-label">{step.label}</span>}
      {step?.author === 'claude' && <span className="history-author">Claude</span>}
    </button>
  );
}
