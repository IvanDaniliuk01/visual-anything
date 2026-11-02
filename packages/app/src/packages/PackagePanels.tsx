/**
 * Packages' panels in the inspector (ADR 0089's M14.4 clarification): for one selected element, each
 * panel of approved code that runs on this computer whose file names the element's component, one it
 * derives from, or none, as a section after the format panel. Its heading names the panel and its
 * package, and folds it away; what its code answers is drawn with the app's own controls; a failure
 * says its problem inside the section, with Show again.
 *
 * The code is called once the selection and the project have stayed the same for a moment, one call
 * at a time for each panel, and only the answer of the call asked for last is shown. A call that
 * failed is not made again by itself: Show again, or another element, calls it again.
 */
import type { PanelBlock, Problem } from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useState } from 'react';
import { useShownComparison } from '../canvas/comparison/mode';
import type { PackageCalls } from '../code/client';
import { useCode, usePackageCalls } from '../code/context';
import type { PackageAnswer } from '../code/messages';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { LatestCall } from './latestCall';
import { elementPanels, type OfferedPanel } from './offered';
import { PanelBlocks } from './PanelBlocks';
import { useRunPackageAction } from './run';
import './panels.css';

/** The panels folded away in this tab, by package and panel, so that the next element keeps them so. */
const folded = new Set<string>();

/** The panels of packages for one element, after the format panel. */
export function PackagePanels({ element }: { element: Element }) {
  const code = useCode();
  const calls = usePackageCalls();
  const { project } = useEditor();
  const packages = code?.packages;
  const panels = useMemo(
    () => (packages ? elementPanels(project, packages, element.id) : []),
    [project, packages, element.id],
  );
  if (!code || !calls || panels.length === 0) return null;
  return panels.map((panel) => {
    // New code, approved again, calls its panel afresh.
    const hash = code.packages.get(panel.package.id)?.code.hash ?? '';
    return (
      <PackagePanel
        key={`${panel.package.id} ${panel.declared.id} ${hash}`}
        panel={panel}
        element={element.id}
        calls={calls}
      />
    );
  });
}

/** What a panel shows: nothing yet, what its code answered, or why it failed. */
type PanelShown =
  | { state: 'waiting' }
  | { state: 'shown'; blocks: PanelBlock[] }
  | { state: 'failed'; problem: Problem };

interface PackagePanelProps {
  panel: OfferedPanel;
  element: Id;
  calls: PackageCalls;
}

function PackagePanel({ panel, element, calls }: PackagePanelProps) {
  const t = useT();
  const { project, send, viewId } = useEditor();
  const comparison = useShownComparison();
  const runAction = useRunPackageAction();
  const headingId = useId();
  const bodyId = useId();
  const { package: pkg, declared } = panel;
  const foldKey = `${pkg.id} ${declared.id}`;
  const [open, setOpen] = useState(() => !folded.has(foldKey));
  const [shown, setShown] = useState<PanelShown>({ state: 'waiting' });
  const [latest] = useState(
    () =>
      new LatestCall<PackageAnswer<PanelBlock[]>>((answer) => {
        setShown(
          answer.ok
            ? { state: 'shown', blocks: answer.value }
            : { state: 'failed', problem: answer.problem },
        );
      }),
  );
  // A failure is not retried by itself (ADR 0089): only Show again or another element calls again.
  const failed = shown.state === 'failed';

  useEffect(() => () => latest.cancel(), [latest]);
  // Called as the element, or the project, changes; a panel folded away is not called.
  useEffect(() => {
    if (!open || failed) return;
    latest.ask(() => calls.packagePanel(pkg.id, { panel: declared.id, element }));
  }, [open, failed, latest, calls, pkg.id, declared.id, element, project]);

  const toggle = () => {
    const next = !open;
    if (next) folded.delete(foldKey);
    else folded.add(foldKey);
    if (!next) latest.cancel();
    setOpen(next);
  };

  // Waiting again calls it again.
  const showAgain = () => setShown({ state: 'waiting' });

  const canRun = runAction !== undefined && send !== undefined && comparison === undefined;
  const run = canRun
    ? (action: string) => {
        const offered = panel.actions.find((each) => each.id === action);
        if (offered) runAction({ package: pkg, declared: offered }, [element], viewId);
      }
    : undefined;

  return (
    <section
      className="inspector-section package-panel"
      aria-labelledby={headingId}
      aria-busy={open && shown.state === 'waiting'}
    >
      <h4 id={headingId}>
        <button
          type="button"
          className="package-panel-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          <span className="package-panel-label">{declared.label}</span>{' '}
          <span className="package-panel-from">
            {t('from the package “{name}”', { name: pkg.name })}
          </span>
        </button>
      </h4>
      <div id={bodyId} className="package-panel-body" hidden={!open}>
        {open && shown.state === 'waiting' && (
          <p className="panel-empty">{t('Asking the package’s code…')}</p>
        )}
        {shown.state === 'shown' &&
          (shown.blocks.length === 0 ? (
            <p className="panel-empty">{t('The package shows nothing here for this element.')}</p>
          ) : (
            <PanelBlocks blocks={shown.blocks} labelledBy={headingId} buttons={{ run }} />
          ))}
        {shown.state === 'failed' && (
          <div className="package-panel-problem">
            <p className="inspector-problem">{t.message(shown.problem.message)}</p>
            <button type="button" className="inspector-action" onClick={showAgain}>
              {t('Show again')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
