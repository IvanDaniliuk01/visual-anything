/**
 * The read-only page's tours (ADR 0058, ADR 0041): the project's tours, each played full screen from
 * here, as the app's tours panel plays them. Playing changes nothing.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { TourFile } from '@visual-anything/schema';
import { useEffect, useId, useRef } from 'react';
import { useT } from '../i18n';
import { DismissIcon } from '../shell/icons';

export function TourChooser({
  project,
  onPlay,
  onClose,
}: {
  project: ProjectSnapshot;
  onPlay: (tour: TourFile) => void;
  onClose: () => void;
}) {
  const t = useT();
  const heading = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('li button')?.focus();
  }, []);
  return (
    <div
      ref={panel}
      className="viewer-popover viewer-scenarios"
      role="dialog"
      aria-labelledby={heading}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="viewer-popover-head">
        <h2 id={heading}>{t('Tours')}</h2>
        <button
          type="button"
          className="viewer-dismiss"
          aria-label={t('Close')}
          title={t('Close (Escape)')}
          onClick={onClose}
        >
          <DismissIcon />
        </button>
      </div>
      <ul className="viewer-scenario-list">
        {project.tours.map((tour) => (
          <li key={tour.id}>
            <button
              type="button"
              className="viewer-scenario"
              disabled={tour.steps.length === 0}
              aria-label={t('Play “{name}” full screen', { name: tour.name })}
              onClick={() => onPlay(tour)}
            >
              <span className="viewer-scenario-name">{tour.name}</span>
              <span className="viewer-scenario-detail">
                {t({ one: '{count} step', other: '{count} steps' }, { count: tour.steps.length })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
