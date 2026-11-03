/**
 * "Connect Claude…" (ADR 0093, section 3): a dialog that says what connecting does, and once the
 * person confirms, asks the local program with `claude/setup` to add itself to Claude Desktop's
 * configuration, as `visual-anything setup-claude` does. It then says what the program did: wrote the
 * configuration, found it there already, or wrote nothing, because it runs from its sources or the
 * file could not be used; with the commands to copy. Restarting Claude Desktop is the person's step,
 * and the dialog says so. Cancel has the focus first, so that Enter alone changes nothing, and Escape
 * closes it.
 */
import type { ClaudeSetupAnswerMessage } from '@visual-anything/core';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import './connect-claude.css';

/** What the clipboard is reached through: the browser's by default. */
export type WriteText = (text: string) => Promise<void>;

function browserClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
    return Promise.reject(new Error('This browser has no clipboard here.'));
  }
  return navigator.clipboard.writeText(text);
}

type Step =
  | { kind: 'asking' }
  | { kind: 'waiting' }
  | { kind: 'answered'; answer: ClaudeSetupAnswerMessage }
  | { kind: 'failed'; why: string };

interface ConnectClaudeDialogProps {
  onClose: () => void;
  writeText?: WriteText;
}

export function ConnectClaudeDialog({
  onClose,
  writeText = browserClipboard,
}: ConnectClaudeDialogProps) {
  const t = useT();
  const live = useContext(LiveContext);
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'asking' });
  useModalFocus(dialog);

  useEffect(() => {
    first.current?.focus();
  }, [step.kind]);

  const connect = async () => {
    const setUp = live?.setUpClaude;
    if (setUp === undefined) {
      setStep({ kind: 'failed', why: 'Visual Anything is not connected, so nothing was changed.' });
      return;
    }
    setStep({ kind: 'waiting' });
    const result = await setUp();
    setStep(
      result.ok
        ? { kind: 'answered', answer: result.answer }
        : { kind: 'failed', why: result.problems.map((each) => each.message).join(' ') },
    );
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog connect-claude-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <h2 id={titleId}>{t('Connect Claude')}</h2>
        {step.kind === 'asking' || step.kind === 'waiting' ? (
          <>
            <p>
              {t(
                'Claude Desktop can work on the project Visual Anything has open: read it, change it as one action you can undo, and show you around it.',
              )}
            </p>
            <p>
              {t(
                'Connecting adds Visual Anything to Claude Desktop’s configuration on this computer, and keeps a copy of the file as it was. Nothing else in it changes.',
              )}
            </p>
            <p>{t('Then restart Claude Desktop: quit it fully, and open it again.')}</p>
            <div className="dialog-actions">
              <button ref={first} type="button" onClick={onClose}>
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="dialog-confirm"
                aria-disabled={step.kind === 'waiting' ? true : undefined}
                onClick={step.kind === 'waiting' ? undefined : () => void connect()}
              >
                {step.kind === 'waiting' ? t('Connecting…') : t('Connect Claude Desktop')}
              </button>
            </div>
          </>
        ) : (
          <>
            {step.kind === 'failed' ? (
              <p role="alert">{t.message(step.why)}</p>
            ) : (
              <Answer answer={step.answer} writeText={writeText} />
            )}
            <div className="dialog-actions">
              <button ref={first} type="button" className="dialog-confirm" onClick={onClose}>
                {t('Close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** What the program did, in words, with what there is to copy. */
function Answer({ answer, writeText }: { answer: ClaudeSetupAnswerMessage; writeText: WriteText }) {
  const t = useT();
  const config = answer.config;
  return (
    <>
      {answer.outcome === 'written' && (
        <>
          <p role="status">{t('Visual Anything is now in Claude Desktop’s configuration.')}</p>
          {answer.backup !== undefined && (
            <p>{t('The file as it was is kept in {path}.', { path: answer.backup })}</p>
          )}
          <p>{t('Restart Claude Desktop to use it: quit it fully, and open it again.')}</p>
        </>
      )}
      {answer.outcome === 'already' && (
        <>
          <p role="status">
            {t('Claude Desktop’s configuration already has Visual Anything: nothing was changed.')}
          </p>
          <p>
            {t('If Claude Desktop does not show it, restart it: quit it fully, and open it again.')}
          </p>
        </>
      )}
      {answer.outcome === 'from-sources' && (
        <>
          <p role="status">
            {t(
              'This Visual Anything runs from its sources, so nothing was written: connecting names the single executable, which Claude starts by itself.',
            )}
          </p>
          <p>
            {t(
              'To have Claude Desktop start these sources instead, add this to “mcpServers” in its configuration:',
            )}
          </p>
          <Copyable
            label={t('Claude Desktop’s entry')}
            text={JSON.stringify({ 'visual-anything': answer.entry }, null, 2)}
            writeText={writeText}
          />
          <p>{t('Then restart Claude Desktop: quit it fully, and open it again.')}</p>
        </>
      )}
      {answer.outcome === 'refused' && <p role="alert">{t.message(answer.why ?? '')}</p>}
      {config !== undefined && (
        <p className="connect-claude-file">
          {t('Claude Desktop’s configuration: {path}', { path: config })}
        </p>
      )}
      {answer.claudeCode !== '' && (
        <>
          <p>{t('For Claude Code, run this in a terminal:')}</p>
          <Copyable
            label={t('Claude Code’s command')}
            text={answer.claudeCode}
            writeText={writeText}
          />
        </>
      )}
    </>
  );
}

/** Text to copy, as it is, with a button that copies it and says whether it could. */
function Copyable({
  label,
  text,
  writeText,
}: {
  label: string;
  text: string;
  writeText: WriteText;
}) {
  const t = useT();
  const [said, setSaid] = useState<'copied' | 'failed' | undefined>(undefined);
  const copy = async () => {
    try {
      await writeText(text);
      setSaid('copied');
    } catch {
      setSaid('failed');
    }
  };
  return (
    <div className="connect-claude-copyable">
      <pre aria-label={label}>{text}</pre>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t('Copy {what}', { what: label })}
      >
        {said === 'copied' ? t('Copied') : t('Copy')}
      </button>
      <span role="status" className="visually-hidden">
        {said === 'copied' ? t('Copied') : ''}
      </span>
      {said === 'failed' && (
        <p role="alert">{t('Could not copy: select the text and copy it by hand.')}</p>
      )}
    </div>
  );
}
