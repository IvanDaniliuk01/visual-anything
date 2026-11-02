/**
 * Running what packages add (ADR 0089's M14.3 clarification): the requests that call an action's or
 * an importer's code, what a run that leaves nothing to review says, and the hook the menus run an
 * action with, whose changes then wait for the person's review.
 */
import type { Id } from '@visual-anything/schema';
import { useContext, useSyncExternalStore } from 'react';
import type { PackageCalls } from '../code/client';
import { usePackageCalls, usePackageChanges } from '../code/context';
import { useT, type Translator } from '../i18n';
import { LiveContext } from '../live/context';
import type { PackageChangesRequest, PackageChangesState, PackageRunOutcome } from './changes';
import type { OfferedAction, OfferedImporter } from './offered';

const IDLE: PackageChangesState = { state: 'idle' };
const NO_SUBSCRIPTION = (): (() => void) => () => {};
const idle = (): PackageChangesState => IDLE;

/** The run under way or the review shown; idle where the editor carries no store. */
export function usePackageChangesState(): PackageChangesState {
  const store = usePackageChanges();
  return useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIPTION, store?.snapshot ?? idle, idle);
}

/** The request that runs one of a package's actions on a selection, in a view. */
export function actionRequest(
  calls: PackageCalls,
  offered: OfferedAction,
  selection: readonly Id[],
  view: Id | undefined,
): PackageChangesRequest {
  const { package: pkg, declared } = offered;
  return {
    package: pkg,
    label: declared.label,
    ask: () =>
      calls.runPackageAction(pkg.id, {
        action: declared.id,
        selection: [...selection],
        ...(view === undefined ? {} : { view }),
      }),
  };
}

/** The request that reads a file with one of a package's importers. */
export function importRequest(
  calls: PackageCalls,
  offered: OfferedImporter,
  file: { name: string; text: string },
): PackageChangesRequest {
  const { package: pkg, declared } = offered;
  return {
    package: pkg,
    label: declared.label,
    quiet: true,
    ask: () =>
      calls.readFileWithPackage(pkg.id, {
        importer: declared.id,
        name: file.name,
        text: file.text,
      }),
  };
}

/**
 * What a run that leaves nothing to review says, in the language read in: that the code proposes no
 * changes, why its call failed, or why its changes cannot apply. Nothing for one under review, or
 * one that another took the place of.
 */
export function outcomeText(
  t: Translator,
  request: PackageChangesRequest,
  outcome: PackageRunOutcome,
): string | undefined {
  const named = { label: request.label, name: request.package.name };
  switch (outcome.kind) {
    case 'review':
    case 'dropped':
      return undefined;
    case 'busy':
      return t(
        'Another package’s action or importer is still running, so “{label}” did not start.',
        {
          label: request.label,
        },
      );
    case 'none':
      return t('“{label}”, of the package “{name}”, proposes no changes.', named);
    case 'failed':
      return t.message(outcome.problem.message);
    case 'refused':
      return t('The changes “{label}”, of the package “{name}”, proposes cannot apply: {why}', {
        ...named,
        why: outcome.problems.map((each) => t.message(each.message)).join(' '),
      });
  }
}

/**
 * Runs an action of a package from a menu: the review opens once its code answers, and a run that
 * leaves nothing to review says why in a notice. Undefined where package code cannot be called.
 */
export function useRunPackageAction():
  ((offered: OfferedAction, selection: readonly Id[], view: Id | undefined) => void) | undefined {
  const t = useT();
  const calls = usePackageCalls();
  const store = usePackageChanges();
  const notify = useContext(LiveContext)?.notify;
  if (!calls || !store) return undefined;
  return (offered, selection, view) => {
    const request = actionRequest(calls, offered, selection, view);
    void store.run(request).then((outcome) => {
      const said = outcomeText(t, request, outcome);
      if (said !== undefined) notify?.(outcome.kind === 'none' ? 'info' : 'error', said);
    });
  };
}
