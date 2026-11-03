/**
 * The review of what a package's action or importer proposes (ADR 0089's M14.3 clarification), in the
 * shell: while the code runs, a notice says so; then the canvas shows the changes as the comparison
 * of the project now with the project with them (ADR 0070), and the Changes tab lists them with
 * Accept and Decline, as Claude's proposals are reviewed (ADR 0073). Accept sends the one command the
 * core previewed, as one action of the person's, which Undo takes back whole; Decline, the
 * comparison's End button or Escape drop the changes, and nothing is sent. Accept first previews the
 * changes again on the project as it is (M14's review): when the project changed so that the
 * comparison differs, the review shows the new one, saying so, and nothing is sent until the person
 * accepts what they now see.
 */
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ComparisonContext, type ComparisonHandle } from '../canvas/comparison/mode';
import { usePackageChanges } from '../code/context';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { ChangesContext, type ChangesHandle } from '../versions/changes/store';
import type { PackageChangesReview, PackageChangesStore } from './changes';
import { usePackageChangesState } from './run';
import './packages.css';

/** The notice that a package's code runs, and the review of what it answered. */
export function PackageChangesReviewer() {
  const t = useT();
  const store = usePackageChanges();
  const { project } = useEditor();
  const state = usePackageChangesState();
  // The changes are previewed on the project as the tab holds it when the code answers.
  const latest = useRef(project);
  useLayoutEffect(() => {
    latest.current = project;
  });
  useEffect(() => store?.attach(() => latest.current), [store]);
  if (!store) return null;
  return (
    <>
      {state.state === 'running' && state.request.quiet !== true && (
        <p className="package-running" role="status">
          {t('Running “{label}”, of the package “{name}”…', {
            label: state.request.label,
            name: state.request.package.name,
          })}
        </p>
      )}
      <ReviewShown store={store} review={state.state === 'reviewing' ? state : undefined} />
    </>
  );
}

/** Shows the changes under review on the canvas and in the Changes tab, and ends both with them. */
function ReviewShown({
  store,
  review,
}: {
  store: PackageChangesStore;
  review: PackageChangesReview | undefined;
}) {
  const t = useT();
  const comparisons = useContext(ComparisonContext);
  const host = useContext(ChangesContext);
  const handles = useRef<{ comparison?: ComparisonHandle; changes?: ChangesHandle }>({});

  useEffect(() => {
    // What this review drew is let go of before it ends, so that its ending does not decline it.
    const ended = () => {
      const { comparison: drawn, changes: listed } = handles.current;
      handles.current = {};
      drawn?.end();
      listed?.close();
    };
    if (!review || !comparisons || !host) return ended;
    const title = t('“{label}”, from the package “{name}”', {
      label: review.changes.label,
      name: review.request.package.name,
    });
    const drawing: { handle?: ComparisonHandle } = {};
    // Shown read-only, as any comparison; its End button and Escape decline the changes.
    const drawn = comparisons.showComparison({
      older: review.older,
      newer: review.preview.project,
      comparison: review.preview.comparison,
      title,
      follows: false,
      onEnd: () => {
        if (drawing.handle === undefined || handles.current.comparison !== drawing.handle) return;
        const listed = handles.current.changes;
        handles.current = {};
        listed?.close();
        store.close();
      },
    });
    drawing.handle = drawn;
    const listed = host.store.openChanges({
      kind: 'proposal',
      title,
      older: review.older,
      newer: review.preview.project,
      comparison: review.preview.comparison,
      controls: <PackageChangesDecision store={store} review={review} />,
    });
    handles.current = { comparison: drawn, changes: listed };
    return ended;
  }, [review, comparisons, host, store, t]);
  return null;
}

/** Accept and Decline, above the changes in the Changes tab. */
export function PackageChangesDecision({
  store,
  review,
}: {
  store: PackageChangesStore;
  review: PackageChangesReview;
}) {
  const t = useT();
  const { send } = useEditor();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const [noLonger, setNoLonger] = useState<string | undefined>(undefined);
  const usable = send !== undefined && !busy;
  const accept = async () => {
    if (!send || busy) return;
    setRefused(false);
    setNoLonger(undefined);
    // What is applied is what the person saw: previewed again on the project as it is now.
    const rechecked = store.recheck();
    if (rechecked.kind === 'moved' || rechecked.kind === 'gone') return;
    if (rechecked.kind === 'refused') {
      setNoLonger(rechecked.problems.map((each) => t.message(each.message)).join(' '));
      return;
    }
    setBusy(true);
    try {
      // One action of the person's: the core checks the changes again as it applies them.
      const result = await send(rechecked.command);
      if (result.ok) store.close();
      else setRefused(true);
    } finally {
      setBusy(false);
    }
  };
  const count = review.changes.commands.length;
  return (
    <div
      className="package-decision"
      role="group"
      aria-label={t('Decide about the changes of the package “{name}”', {
        name: review.request.package.name,
      })}
    >
      <p className="package-decision-label">
        {t('The package “{name}” proposes: {label}', {
          name: review.request.package.name,
          label: review.changes.label,
        })}
      </p>
      {review.moved === true && (
        <p className="package-decision-moved" role="status">
          {t(
            'The project changed since these changes were shown, so they are shown again on the project as it is now. Accept them again to apply what you see.',
          )}
        </p>
      )}
      <p className="package-decision-note">
        {t(
          {
            one: 'Nothing changes until you accept. Accepting makes its {count} command one action of yours, which Undo takes back whole.',
            other:
              'Nothing changes until you accept. Accepting makes its {count} commands one action of yours, which Undo takes back whole.',
          },
          { count },
        )}
      </p>
      <div className="package-decision-buttons">
        <button
          type="button"
          className="package-accept"
          aria-disabled={usable ? undefined : true}
          title={send === undefined ? t('Visual Anything is not connected') : undefined}
          onClick={usable ? () => void accept() : undefined}
        >
          {t('Accept')}
        </button>
        <button type="button" onClick={() => store.close()}>
          {t('Decline')}
        </button>
      </div>
      {noLonger !== undefined && (
        <p className="package-decision-problem" role="alert">
          {t('The project changed, and the changes no longer apply to it: {why}', {
            why: noLonger,
          })}
        </p>
      )}
      {refused && (
        <p className="package-decision-problem" role="alert">
          {t('The changes could not apply: the notice says why. Decline them, or try again.')}
        </p>
      )}
    </div>
  );
}
