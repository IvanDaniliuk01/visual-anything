import type { HistorySummary } from '@visual-anything/core';
import { useContext, useEffect, useEffectEvent, useRef } from 'react';
import { LanguageControl } from '../i18n/LanguageControl';
import { useT, type Translator } from '../i18n';
import { LiveContext, type Live } from '../live/context';
import { IS_APPLE } from '../live/platform';
import { historyShortcut, isTextEntry, type HistoryAction } from '../live/shortcuts';
import { ThemeControl } from '../theme/ThemeControl';
import { usePreferencesLink } from '../theme/usePreferences';
import { RedoIcon, UndoIcon } from './icons';

/** The product's name, as the header and the tab's title write it. */
export const PRODUCT_NAME = 'Visual Anything';

interface HeaderProps {
  /** The open project's name; absent until a project is open. */
  projectName?: string | undefined;
  /** The open view's name; absent when no view is open. */
  viewName?: string | undefined;
}

/**
 * The header: the product's mark and name, then the open project and view, and at its end the
 * Language and Theme controls. While a project is open in a live session, it also holds undo and redo. It is on every
 * screen, so it also keeps the person's preferences in step with the local program, and names the tab
 * after the open project.
 */
export function Header({ projectName, viewName }: HeaderProps) {
  const t = useT();
  const live = useContext(LiveContext);
  usePreferencesLink();
  useEffect(() => {
    document.title = projectName === undefined ? PRODUCT_NAME : `${projectName} · ${PRODUCT_NAME}`;
  }, [projectName]);
  return (
    <header className="shell-header">
      <h1 className="shell-product">
        <ProductMark />
        {PRODUCT_NAME}
      </h1>
      {projectName !== undefined && (
        <dl className="shell-context">
          <div>
            <dt>{t('Project')}</dt>
            <dd>{projectName}</dd>
          </div>
          {viewName !== undefined && (
            <div>
              <dt>{t('View')}</dt>
              <dd>{viewName}</dd>
            </div>
          )}
        </dl>
      )}
      <div className="shell-actions">
        {projectName !== undefined && live !== null && <HistoryControls live={live} />}
        <LanguageControl />
        <ThemeControl />
      </div>
    </header>
  );
}

/** The product's mark: two overlapping rounded squares, in the accent color. */
function ProductMark() {
  return (
    <svg
      className="shell-mark"
      aria-hidden="true"
      focusable="false"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <rect x="1.5" y="1.5" width="11" height="11" rx="2.5" />
      <rect x="7.5" y="7.5" width="11" height="11" rx="2.5" fill="currentColor" fillOpacity="0.3" />
    </svg>
  );
}

/** An action the history could undo or redo. */
type HistoryStep = NonNullable<HistorySummary['undo']>;

const VERBS: Record<HistoryAction, string> = { undo: 'Undo', redo: 'Redo' };

/** What each button says it would do, by who did the action. */
const NAMES: Record<HistoryAction, { user: string; claude: string }> = {
  undo: { user: 'Undo: {action}', claude: 'Undo Claude’s action: {action}' },
  redo: { user: 'Redo: {action}', claude: 'Redo Claude’s action: {action}' },
};

const NOTHING: Record<HistoryAction, string> = { undo: 'Nothing to undo', redo: 'Nothing to redo' };

const ICONS: Record<HistoryAction, typeof UndoIcon> = { undo: UndoIcon, redo: RedoIcon };

const SHORTCUTS: Record<HistoryAction, { keys: string; shown: string }> = {
  undo: { keys: 'Control+Z Meta+Z', shown: IS_APPLE ? '⌘Z' : 'Ctrl+Z' },
  redo: { keys: 'Control+Shift+Z Meta+Shift+Z Control+Y', shown: IS_APPLE ? '⌘⇧Z' : 'Ctrl+Y' },
};

/** What a history button is called: "Undo: Rename …", or "Undo Claude’s action: Rename …". */
function nameOf(t: Translator, action: HistoryAction, step: HistoryStep | undefined): string {
  if (step === undefined) return t(VERBS[action]);
  const names = NAMES[action];
  return t(step.author === 'claude' ? names.claude : names.user, {
    action: t.message(step.label),
  });
}

/**
 * Undo and redo, as buttons and as keyboard shortcuts. Each button names the action it would undo or
 * redo, and says when Claude did it. One undo or redo is sent at a time: the next waits for the
 * answer, so that holding a shortcut down does not queue more than the history holds.
 */
function HistoryControls({ live }: { live: Live }) {
  const t = useT();
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
    <div className="shell-history" role="group" aria-label={t('Undo history')}>
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
  const t = useT();
  const name = nameOf(t, action, step);
  const shortcut = SHORTCUTS[action];
  const Icon = ICONS[action];
  const tooltip = available
    ? t('{name} ({shortcut})', { name, shortcut: shortcut.shown })
    : connected
      ? t(NOTHING[action])
      : t('Visual Anything is not connected');
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
      <Icon />
      <span className="history-verb">{t(VERBS[action])}</span>
      {step !== undefined && <span className="history-label">{t.message(step.label)}</span>}
      {step?.author === 'claude' && <span className="history-author">Claude</span>}
    </button>
  );
}
