/**
 * The approval of a package's code (ADR 0054): the dialog shows the code as it is, its hash, and each
 * capability it declares, which the person grants on their own; fetching from a web origin is off
 * until they turn it on. Approving keeps the hash in their preferences, never in the project, and any
 * change to the code or its capabilities asks again.
 *
 * A built-in package's code (ADR 0089's M14.6 clarification) ships with the program and runs as its
 * own: the dialog shows it and what it may reach, and says so, with nothing to approve or withdraw.
 */
import { readCapability } from '@visual-anything/core';
import type { Capability } from '@visual-anything/schema';
import { useId, useRef, useState } from 'react';
import { useModalFocus } from '../canvas/focus';
import { useT } from '../i18n';
import { useCode, type PackageCodeView } from './context';
import { capabilityText } from './words';
import './code.css';

interface ApprovalDialogProps {
  view: PackageCodeView;
  /** Whether the code changed since the review opened, so that what shows is new. */
  changed?: boolean;
  /** Approves the code shown, by its hash and with the capabilities shown, those granted. */
  onApprove: (reviewed: string, shown: Capability[], granted: Capability[]) => void;
  onWithdraw: () => void;
  onClose: () => void;
}

/**
 * The approval dialog of the package being reviewed, while one is; nothing otherwise. A new code
 * shows in a dialog of its own, saying that it changed, and an approval of the code shown before it
 * approves nothing.
 */
export function CodeApproval() {
  const code = useCode();
  const pkg = code?.reviewing;
  const view = pkg === undefined ? undefined : code?.packages.get(pkg);
  if (!code || pkg === undefined || !view) return null;
  return (
    <ApprovalDialog
      key={view.code.hash}
      view={view}
      changed={code.reviewedHash !== undefined && code.reviewedHash !== view.code.hash}
      onApprove={(reviewed, shown, granted) => {
        // Refused when the code is another by now: the dialog stays, and shows the new code.
        if (code.approve(pkg, reviewed, shown, granted)) code.review(undefined);
      }}
      onWithdraw={() => {
        code.withdraw(pkg);
        code.review(undefined);
      }}
      onClose={() => code.review(undefined)}
    />
  );
}

export function ApprovalDialog({
  view,
  changed = false,
  onApprove,
  onWithdraw,
  onClose,
}: ApprovalDialogProps) {
  const t = useT();
  const dialog = useRef<HTMLDivElement>(null);
  useModalFocus(dialog);
  const titleId = useId();
  const codeId = useId();
  const { code, status } = view;
  const approved = status.state === 'approved';
  const builtIn = approved && status.builtIn === true;
  const [granted, setGranted] = useState<ReadonlySet<Capability>>(
    () =>
      new Set(
        approved
          ? status.granted
          : code.capabilities.filter((each) => readCapability(each)?.kind !== 'network'),
      ),
  );
  const lines = code.text.split('\n').length;

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog code-approval"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2 id={titleId}>{t('The code of “{name}”', { name: code.name })}</h2>
        {changed && (
          <p className="inspector-warning" role="alert">
            {t(
              'The code changed while it was open here: this is the code as it is now, and nothing was approved.',
            )}
          </p>
        )}
        <p>
          {builtIn
            ? t(
                'It is built into Visual Anything and runs as part of the program, in the same sandbox as any package’s code, without an approval. You can turn it off on this computer in Packages….',
              )
            : t(
                'It runs in a sandbox, with no access to your files, the page or the network beyond what you grant below. Approve it only if you trust where it comes from.',
              )}
        </p>
        {status.state === 'too-large' && (
          <p className="inspector-warning">
            {t('It is over 256 KiB, so it never runs, approved or not.')}
          </p>
        )}
        <p className="dialog-note">
          {t({ one: '{count} line', other: '{count} lines' }, { count: lines })}
          {' · '}
          <span title={code.hash}>{t('hash {hash}…', { hash: code.hash.slice(0, 12) })}</span>
        </p>
        <pre className="code-approval-text" id={codeId} tabIndex={0} aria-label={t('Its code')}>
          <code>{code.text}</code>
        </pre>
        {builtIn ? (
          code.capabilities.length > 0 ? (
            <ul className="code-values" aria-label={t('What it may reach beyond its element')}>
              {code.capabilities.map((capability) => (
                <li key={capability}>{capabilityText(t, capability)}</li>
              ))}
            </ul>
          ) : (
            <p className="dialog-note">{t('It reaches nothing beyond its element.')}</p>
          )
        ) : code.capabilities.length > 0 ? (
          <fieldset className="code-approval-capabilities">
            <legend>{t('What it may reach beyond its element')}</legend>
            {code.capabilities.map((capability) => (
              <Capable
                key={capability}
                capability={capability}
                checked={granted.has(capability)}
                onChange={(checked) => {
                  const next = new Set(granted);
                  if (checked) next.add(capability);
                  else next.delete(capability);
                  setGranted(next);
                }}
              />
            ))}
            {code.capabilities.some((each) => readCapability(each)?.kind === 'network') && (
              <p className="dialog-note">
                {t('No hook fetches anything yet: fetching waits for live values.')}
              </p>
            )}
          </fieldset>
        ) : (
          <p className="dialog-note">{t('It reaches nothing beyond its element.')}</p>
        )}
        <div className="dialog-actions">
          {builtIn && (
            <button type="button" className="dialog-confirm" onClick={onClose}>
              {t('Close')}
            </button>
          )}
          {approved && !builtIn && (
            <button type="button" onClick={onWithdraw}>
              {t('Withdraw approval')}
            </button>
          )}
          {!builtIn && (
            <button type="button" onClick={onClose}>
              {t('Cancel')}
            </button>
          )}
          {status.state !== 'too-large' && !builtIn && (
            <button
              type="button"
              className="dialog-confirm"
              onClick={() =>
                onApprove(
                  code.hash,
                  [...code.capabilities],
                  code.capabilities.filter((each) => granted.has(each)),
                )
              }
            >
              {approved ? t('Keep approved') : t('Approve and run')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Capable({
  capability,
  checked,
  onChange,
}: {
  capability: Capability;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <p className="dialog-choice">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>
        {capabilityText(t, capability)} <code>{capability}</code>
      </label>
    </p>
  );
}
