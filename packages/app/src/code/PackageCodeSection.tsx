/**
 * A package's code in the component editor (ADR 0054): how long it is, its hash, what it may reach,
 * whether it is approved and runs, and the way to review it, approve it or withdraw the approval. A
 * built-in package's code is the program's own (ADR 0089's M14.6 clarification): it says so, and its
 * code can be read, never approved.
 */
import type { Id } from '@visual-anything/schema';
import { useId } from 'react';
import { useT } from '../i18n';
import { capabilityText, standingText } from './words';
import { useCode } from './context';
import './code.css';

export function PackageCodeSection({ id }: { id: Id }) {
  const t = useT();
  const code = useCode();
  const headingId = useId();
  const view = code?.packages.get(id);
  if (!code || !view) return null;
  const { status, run } = view;
  const lines = view.code.text.split('\n').length;
  const said = standingText(t, view);
  const builtIn = status.state === 'approved' && status.builtIn === true;

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Package code')}</h4>
      <p className="inspector-notes">
        {t({ one: '{count} line', other: '{count} lines' }, { count: lines })}
        {' · '}
        <span title={view.code.hash}>
          {t('hash {hash}…', { hash: view.code.hash.slice(0, 12) })}
        </span>
      </p>
      {view.code.capabilities.length > 0 && (
        <ul className="code-values" aria-label={t('What it may reach beyond its element')}>
          {view.code.capabilities.map((capability) => (
            <li key={capability}>
              <span>{capabilityText(t, capability)}</span>
              {status.state === 'approved' && !builtIn && !status.granted.includes(capability) && (
                <span className="code-mark">{t('not granted')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {said !== undefined ? (
        <p className="inspector-warning">{said}</p>
      ) : (
        <p className="inspector-notes">
          {builtIn
            ? run?.state === 'running'
              ? t(
                  'Built into Visual Anything: it runs as part of the program, without an approval.',
                )
              : t(
                  'Built into Visual Anything: it runs as part of the program once the worker starts.',
                )
            : run?.state === 'running'
              ? t('Approved, and running.')
              : t('Approved: it runs once the worker starts.')}
        </p>
      )}
      {run?.problem && run.state === 'running' && (
        <p className="inspector-warning">{t.message(run.problem.message)}</p>
      )}
      {status.state !== 'too-large' && (
        <button type="button" className="inspector-action" onClick={() => code.review(id)}>
          {builtIn
            ? t('Show the code…')
            : status.state === 'approved'
              ? t('Review the code…')
              : t('Review and approve the code…')}
        </button>
      )}
    </section>
  );
}
