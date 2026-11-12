/**
 * The person's consent before a script library is fetched (ADR 0107): when Claude asks for one, the
 * program asks every open app, and this dialog shows who asks, for which of the project's packages,
 * the npm package and its exact version, and the registry's two addresses it would read, before any
 * byte is fetched. Fetch answers `script-library/consented` with the person's approval, Refuse
 * without it; then the dialog says what was kept and its size, or why nothing was. The first app to
 * answer decides; the others close their dialog when the program says what came of it.
 */
import type { ScriptLibraryConsentMessage } from '@visual-anything/core';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import { librarySize } from './explorable';
import './explorables.css';

export function ScriptLibraryConsent() {
  const live = useContext(LiveContext);
  const waiting = live?.scriptLibraryConsents?.[0];
  const outcomes = live?.scriptLibraryOutcomes;
  const answer = live?.answerScriptLibraryConsent;
  // The request this tab approved, whose outcome the dialog waits for.
  const [fetching, setFetching] = useState<ScriptLibraryConsentMessage>();
  const outcome =
    fetching === undefined
      ? undefined
      : outcomes?.find((each) => each.requestId === fetching.requestId);
  if (fetching) {
    return <Outcome asked={fetching} outcome={outcome} onClose={() => setFetching(undefined)} />;
  }
  if (!waiting || !answer) return null;
  return (
    <ConsentDialog
      key={waiting.requestId}
      asked={waiting}
      onAnswer={(approved) => {
        answer(waiting.requestId, approved);
        if (approved) setFetching(waiting);
      }}
    />
  );
}

function ConsentDialog({
  asked,
  onAnswer,
}: {
  asked: ScriptLibraryConsentMessage;
  onAnswer: (approved: boolean) => void;
}) {
  const t = useT();
  const dialog = useRef<HTMLDivElement>(null);
  const refuse = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog);
  useEffect(() => refuse.current?.focus(), []);
  const titleId = useId();
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog script-library-consent"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onAnswer(false);
        }}
      >
        <h2 id={titleId}>{t('Fetch a script library?')}</h2>
        <p>
          {asked.asker === 'claude'
            ? t('Claude asks for a script library for the package “{package}”:', {
                package: asked.package,
              })
            : t('You asked for a script library for the package “{package}”:', {
                package: asked.package,
              })}
        </p>
        <p className="script-library-consent-name">
          {t('{npm}, version {version}', { npm: asked.npm, version: asked.version })}
        </p>
        {asked.path !== undefined && (
          <p className="dialog-note">{t('Its file: {path}', { path: asked.path })}</p>
        )}
        <p className="dialog-note">
          {t('Visual Anything reads these two addresses of the npm registry:')}
        </p>
        <ul className="script-library-consent-addresses">
          <li>
            <code>{asked.document}</code>
          </li>
          <li>
            <code>{asked.tarball}</code>
          </li>
        </ul>
        <p>
          {t(
            'Nothing is fetched until you approve. It checks the package against the registry’s own hash, runs none of its install scripts and keeps one file beside the project, which only an approved explorable runs.',
          )}
        </p>
        <div className="dialog-actions">
          <button ref={refuse} type="button" onClick={() => onAnswer(false)}>
            {t('Refuse')}
          </button>
          <button type="button" className="dialog-confirm" onClick={() => onAnswer(true)}>
            {t('Fetch')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Outcome({
  asked,
  outcome,
  onClose,
}: {
  asked: ScriptLibraryConsentMessage;
  outcome: { kept?: { bytes: number; license?: string }; refused?: string } | undefined;
  onClose: () => void;
}) {
  const t = useT();
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog);
  const titleId = useId();
  const name = t('{npm}, version {version}', { npm: asked.npm, version: asked.version });
  const size = outcome?.kept ? librarySize(outcome.kept.bytes) : undefined;
  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog script-library-consent"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2 id={titleId}>{name}</h2>
        <p role="status">
          {outcome === undefined
            ? t('Fetching it from the npm registry…')
            : outcome.kept && size
              ? t('Kept beside the project: {size} {unit}, license {license}.', {
                  size: size.value,
                  unit: size.unit,
                  license: outcome.kept.license ?? t('not said'),
                })
              : t('Nothing was kept: {why}', { why: t.message(outcome.refused ?? '') })}
        </p>
        <div className="dialog-actions">
          <button type="button" className="dialog-confirm" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
