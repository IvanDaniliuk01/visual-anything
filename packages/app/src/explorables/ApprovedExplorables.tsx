/**
 * The approvals of explorables, in the Packages dialog beside package code's (ADR 0107, ADR 0060):
 * each with its explorable's name when the project defines it, who gave it (the person, or Claude
 * continuing the person's approval of the text it wrote over), whether it approves the text that
 * runs now, and Withdraw approval. An explorable whose approval is withdrawn shows its card again.
 * Approvals are the person's, outside every project, so the list holds those of other projects too.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { useId, useMemo } from 'react';
import { useT } from '../i18n';
import { explorableOf } from './explorable';
import { useExplorableApprovals } from './hooks';

export function ApprovedExplorables({ project }: { project: ProjectSnapshot }) {
  const t = useT();
  const headingId = useId();
  const { approvals, revoke } = useExplorableApprovals();
  const current = useMemo(() => {
    const hashes = new Map<string, string>();
    for (const approval of approvals) {
      const shown = explorableOf(project, approval.explorable);
      if (shown?.hash !== undefined) hashes.set(approval.explorable, shown.hash);
    }
    return hashes;
  }, [approvals, project]);
  return (
    <section className="packages-explorables" aria-labelledby={headingId}>
      <h3 id={headingId}>{t('Approved explorables')}</h3>
      {approvals.length === 0 ? (
        <p className="dialog-note">
          {t('No explorable is approved yet. Each asks you before it runs the first time.')}
        </p>
      ) : (
        <ul className="packages-list" aria-labelledby={headingId}>
          {approvals.map((approval) => {
            const shown = explorableOf(project, approval.explorable);
            const name = shown?.definition.name ?? approval.explorable;
            const now = current.get(approval.explorable) === approval.hash;
            return (
              <li key={approval.hash} className="packages-explorable">
                <span className="item-name">{name}</span>
                <p className="dialog-note">
                  {[
                    approval.by === 'claude'
                      ? t('Continued from your approval when Claude changed it')
                      : t('Approved by you'),
                    shown === undefined
                      ? t('not in this project')
                      : now
                        ? t('the text it runs now')
                        : t('an earlier text'),
                  ].join(' · ')}{' '}
                  <span title={approval.hash}>
                    {t('hash {hash}…', { hash: approval.hash.slice(0, 12) })}
                  </span>
                </p>
                <button
                  type="button"
                  className="packages-action"
                  aria-label={t('Withdraw the approval of “{name}”', { name })}
                  onClick={() => revoke(approval.hash)}
                >
                  {t('Withdraw approval')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
