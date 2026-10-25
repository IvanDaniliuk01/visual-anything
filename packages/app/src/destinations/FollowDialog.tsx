/**
 * The dialog that asks before something opens outside this tab (ADR 0056): a web address, by its
 * host, shown with the whole address as text; or another project, by its folder. Cancel has the focus
 * first, so that Enter alone never opens anything, and Escape cancels.
 */
import { useEffect, useId, useRef } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useT } from '../i18n';
import type { Asked } from './follower';
import './destinations.css';

interface FollowDialogProps {
  plan: Asked;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FollowDialog({ plan, onConfirm, onCancel }: FollowDialogProps) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog follow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
          }
        }}
      >
        {plan.kind === 'web' ? (
          <>
            <h2 id={titleId}>{t('Open a page of {host}?', { host: plan.host })}</h2>
            <p>{t('It opens in a new tab, which cannot reach this one. Its whole address:')}</p>
            <p className="follow-address">{plan.url}</p>
          </>
        ) : (
          <>
            <h2 id={titleId}>{t('Open the project in “{folder}”?', { folder: plan.folder })}</h2>
            <p>
              {t(
                'Its folder is {path}, from this project’s folder. It opens in a tab of its own, through the Visual Anything that runs on it, which starts if none does.',
                { path: plan.project },
              )}
            </p>
            {plan.view !== undefined && (
              <p>{t('It opens at its view {view}.', { view: plan.view })}</p>
            )}
          </>
        )}
        <div className="dialog-actions">
          <button ref={cancel} type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
          <button type="button" className="dialog-confirm" onClick={onConfirm}>
            {plan.kind === 'web' ? t('Open the page') : t('Open the project')}
          </button>
        </div>
      </div>
    </div>
  );
}
