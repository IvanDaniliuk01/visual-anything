/**
 * The header's menu, at its end (A5), named "Menu": one quiet icon button that opens a small panel under
 * it with the same choices the header showed before, the theme as three radios and the language as
 * three more. Each choice applies at once, as it did. Escape or a press outside closes the panel, and
 * the focus goes back to the button; opening it moves the focus to the theme chosen, so the arrow keys
 * move through each group as through any radios. Under them, while a project or a start screen is
 * open, "Projects…" goes back to the Projects screen, and while the local program is connected,
 * "Connect Claude…" closes the panel and opens its dialog (ADR 0093).
 */
import { useContext, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useOutsidePress } from '../canvas/focus';
import { useT } from '../i18n';
import { LanguageControl } from '../i18n/LanguageControl';
import { LiveContext } from '../live/context';
import { ThemeControl } from '../theme/ThemeControl';
import { ConnectClaudeDialog } from './ConnectClaude';
import { PreferencesIcon } from './icons';

const NAME = 'Menu';

export function PreferencesMenu() {
  const t = useT();
  const live = useContext(LiveContext);
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useOutsidePress(wrapper, () => setOpen(false));

  useLayoutEffect(() => {
    if (open) panel.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div ref={wrapper} className="preferences" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className="preferences-button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t(NAME)}
        title={t(NAME)}
        onClick={() => setOpen((last) => !last)}
      >
        <PreferencesIcon />
      </button>
      {open && (
        <div
          ref={panel}
          id={panelId}
          className="preferences-panel"
          role="group"
          aria-label={t(NAME)}
        >
          {/* Each group says its name to screen readers itself. */}
          <p className="preferences-heading" aria-hidden="true">
            {t('Theme')}
          </p>
          <ThemeControl labelled />
          <p className="preferences-heading" aria-hidden="true">
            {t('Language')}
          </p>
          <LanguageControl />
          {live?.goHome !== undefined &&
            live.status === 'open' &&
            (live.project !== undefined || live.start !== undefined) && (
              <button
                type="button"
                className="preferences-action"
                onClick={() => {
                  setOpen(false);
                  const notify = live.notify;
                  void live.goHome?.().then((result) => {
                    if (!result.ok) {
                      notify('error', result.problems.map((each) => each.message).join(' '));
                    }
                  });
                }}
              >
                {t('Projects…')}
              </button>
            )}
          {live?.setUpClaude !== undefined && (
            <button
              type="button"
              className="preferences-action"
              onClick={() => {
                setOpen(false);
                setConnecting(true);
              }}
            >
              {t('Connect Claude…')}
            </button>
          )}
        </div>
      )}
      {connecting && (
        <ConnectClaudeDialog
          onClose={() => {
            setConnecting(false);
            button.current?.focus();
          }}
        />
      )}
    </div>
  );
}
