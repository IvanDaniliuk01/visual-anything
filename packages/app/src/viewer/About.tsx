/**
 * The read-only page's About panel: the project, when the page was made, what the page is, and the
 * packages its views use, each with its version, license and attribution where the package gives them
 * (ADR 0047), and where its images come from. Attribution travels with what is shared.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { useId, useMemo, useRef } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useT } from '../i18n';
import { creditsOf } from './credits';

export function About({
  project,
  made,
  onClose,
}: {
  project: ProjectSnapshot;
  made?: string;
  onClose: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog);
  const credits = useMemo(() => creditsOf(project), [project]);
  const madeOn = made === undefined ? undefined : new Date(made);
  const date =
    madeOn === undefined || Number.isNaN(madeOn.getTime())
      ? undefined
      : new Intl.DateTimeFormat(t.language, { dateStyle: 'long', timeStyle: 'short' }).format(
          madeOn,
        );
  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        className="dialog viewer-about"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2 id={titleId}>{project.project.name}</h2>
        {project.project.description !== undefined && project.project.description !== '' && (
          <p>{project.project.description}</p>
        )}
        <p className="dialog-note">
          {t(
            'A read-only page of this project, made with Visual Anything: it shows every view and plays every scenario, changes nothing, and connects nowhere.',
          )}
        </p>
        {date !== undefined && <p className="dialog-note">{t('Made on {date}.', { date })}</p>}
        <p className="dialog-note">
          {t('{views} and {scenarios}.', {
            views: t(
              { one: '{count} view', other: '{count} views' },
              { count: project.views.length },
            ),
            scenarios: t(
              { one: '{count} scenario', other: '{count} scenarios' },
              { count: project.scenarios.length },
            ),
          })}
        </p>
        <h3 className="viewer-about-heading">{t('Packages')}</h3>
        <ul className="viewer-credits">
          {credits.map((credit) => (
            <li key={credit.id}>
              <span className="viewer-credit-name">
                {credit.builtIn ? t.definition(credit.id, credit.name) : credit.name}
              </span>{' '}
              <span className="viewer-credit-detail">
                {[
                  credit.builtIn ? t('built into Visual Anything') : t('the project’s own'),
                  ...(credit.version === undefined
                    ? []
                    : [t('version {version}', { version: credit.version })]),
                  ...(credit.license === undefined
                    ? []
                    : [t('license {license}', { license: credit.license })]),
                ].join(' · ')}
              </span>
              {credit.attribution !== undefined && (
                <p className="viewer-credit-attribution">{credit.attribution}</p>
              )}
              {credit.imageSources.length > 0 && (
                <p className="viewer-credit-attribution">
                  {t('Images: {sources}', { sources: credit.imageSources.join('; ') })}
                </p>
              )}
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="button" className="dialog-confirm" onClick={onClose}>
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
