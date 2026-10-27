/**
 * The Motion and Fades preferences (ADR 0077, ADR 0032), in the tours and scenario panels: how tours and scenario
 * playback move. Motion is as the system says, reduced, where every camera change cuts and travelling
 * markers stay still, or full; Fades turns the stages' fades and the cuts' cross-fades on or off.
 * Each change applies in the tab at once, and the local program keeps the latest as the person's.
 */
import { MOTION_CHOICES, type MotionChoice } from '@visual-anything/core';
import { useId } from 'react';
import { useT } from '../i18n';
import { useSystemReducedMotion } from '../scenarios/motion';
import { usePreferences } from '../theme/usePreferences';

const LABELS: Record<MotionChoice, string> = {
  system: 'As the system says',
  reduced: 'Reduced',
  full: 'Full',
};

export function MotionPreferences() {
  const t = useT();
  const { preferences, change } = usePreferences();
  const systemReduces = useSystemReducedMotion();
  const name = useId();
  const hint = useId();
  return (
    <fieldset className="tour-motion" aria-describedby={hint}>
      <legend>{t('How tours and scenarios move')}</legend>
      <div className="tour-motion-choices" role="radiogroup" aria-label={t('Motion')}>
        <span className="tour-motion-label" aria-hidden="true">
          {t('Motion')}
        </span>
        {MOTION_CHOICES.map((choice) => (
          <label key={choice} className="tour-motion-choice">
            <input
              type="radio"
              name={name}
              value={choice}
              checked={preferences.motion === choice}
              onChange={() => change({ motion: choice })}
            />
            <span>
              {choice === 'system'
                ? t(
                    systemReduces
                      ? 'As the system says (reduced now)'
                      : 'As the system says (full now)',
                  )
                : t(LABELS[choice])}
            </span>
          </label>
        ))}
      </div>
      <label className="tour-motion-choice">
        <input
          type="checkbox"
          checked={preferences.fades}
          onChange={(event) => change({ fades: event.target.checked })}
        />
        <span>{t('Fades')}</span>
      </label>
      <p id={hint} className="tour-field-hint">
        {t(
          'Reduced motion cuts every camera move and keeps travelling markers still. Fades cross-fade where the camera cuts, and fade each step’s marks and caption.',
        )}
      </p>
    </fieldset>
  );
}
