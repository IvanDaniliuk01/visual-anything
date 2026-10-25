/** What the app says of package code, in the language read in (ADR 0054, ADR 0038). */
import { offProblem, readCapability } from '@visual-anything/core';
import type { Capability } from '@visual-anything/schema';
import type { Translator } from '../i18n';
import type { PackageCodeView } from './context';

/** What a capability lets code do, in words. */
export function capabilityText(t: Translator, capability: Capability): string {
  const read = readCapability(capability);
  switch (read?.kind) {
    case 'model:read':
      return t('Read the whole model, without changing it');
    case 'time':
      return t('Read the clock');
    case 'network':
      return t('Fetch from {origin}, through Visual Anything', { origin: read.origin });
    default:
      return capability;
  }
}

/** Why a package's code does not run, or what keeps it off; nothing while it runs. */
export function standingText(t: Translator, view: PackageCodeView): string | undefined {
  const { code, status, run } = view;
  if (status.state === 'too-large') {
    return t('The code of “{name}” is over 256 KiB, so it never runs.', { name: code.name });
  }
  if (status.state === 'unapproved') {
    return t('The code of “{name}” is not approved, so it does not run.', { name: code.name });
  }
  if (run?.state === 'off') {
    return t.message(
      run.problem?.message ?? offProblem({ id: code.package, name: code.name }).message,
    );
  }
  if (run?.state === 'failed' && run.problem) return t.message(run.problem.message);
  return undefined;
}
