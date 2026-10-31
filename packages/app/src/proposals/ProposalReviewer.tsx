/**
 * What draws the review of Claude's proposal (ADR 0073), in the shell: while the person reviews it,
 * the canvas shows it as the comparison of the project now with the proposed one (ADR 0070), and the
 * Changes tab lists its changes with their ticks, what each needs, those the person changed too, and
 * Accept, Accept the ticked changes and Refuse. Both follow the proposal as the program shows it anew,
 * and close once it closes. Ending the comparison, with its End button or Escape, ends the review;
 * the proposal still waits.
 */
import type { Change, ShownProposalChange } from '@visual-anything/core';
import { changeKey } from '@visual-anything/core';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ComparisonContext, type ComparisonHandle } from '../canvas/comparison/mode';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import { ChangesContext, type ChangesHandle, type OpenedChanges } from '../versions/changes/store';
import { ProposalChangeDetails, ProposalDecision } from './ProposalDecision';
import { comparisonOf, useReview, type ProposalReview } from './review';
import { alsoTickedText } from './text';

export function ProposalReviewer({ review }: { review: ProposalReview }) {
  const t = useT();
  const live = useContext(LiveContext);
  const comparisons = useContext(ComparisonContext);
  const host = useContext(ChangesContext);
  const proposal = live?.proposal;
  // The review follows the proposal the program shows, before anything draws it.
  useLayoutEffect(() => review.follow(proposal), [review, proposal]);
  const snapshot = useReview()?.snapshot;
  const reviewing = snapshot?.reviewing === true;
  const shown = snapshot?.proposal;
  const ticked = snapshot?.ticked;
  const handles = useRef<{ comparison?: ComparisonHandle; changes?: ChangesHandle }>({});

  const byKey = useMemo(
    () =>
      new Map<string, ShownProposalChange>(
        (shown?.shown.changes ?? []).map((each) => [each.key, each]),
      ),
    [shown],
  );
  const comparison = useMemo(
    () => (shown ? comparisonOf(shown.shown.changes, shown.shown.names) : undefined),
    [shown],
  );

  useEffect(() => {
    // What this review drew is let go of before it ends, so that its ending does not end the review.
    const ended = () => {
      const { comparison: drawn, changes: listed } = handles.current;
      handles.current = {};
      drawn?.end();
      listed?.close();
    };
    if (!reviewing || !shown || !comparison || !comparisons || !host || !ticked) {
      ended();
      return;
    }
    const title = t('Claude’s proposal');
    const changes: Omit<OpenedChanges, 'kind'> = {
      title,
      older: shown.base,
      newer: shown.proposed,
      comparison,
      ticks: {
        ticked,
        onTick: (keys, on) => {
          const also = review.tick(keys, on);
          const said = alsoTickedText(t, also, on, byKey, shown);
          if (said !== '') host.store.say(said);
        },
      },
      noteOf: (change: Change) =>
        byKey.get(changeKey(change))?.changedByYou === true ? t('Changed by you too') : undefined,
      actions: (change: Change) => <ProposalChangeDetails changeKey={changeKey(change)} />,
      controls: <ProposalDecision />,
    };
    const showing = handles.current;
    if (showing.comparison?.showing && showing.changes?.open) {
      showing.comparison.update({
        older: shown.base,
        newer: shown.proposed,
        comparison,
        title,
      });
      showing.changes.update(changes);
      return;
    }
    ended();
    // Shown read-only, as the comparison mode draws any comparison; its End button and Escape end it,
    // and so does another comparison shown in its place.
    const drawing: { handle?: ComparisonHandle } = {};
    const drawn = comparisons.showComparison({
      older: shown.base,
      newer: shown.proposed,
      comparison,
      title,
      follows: false,
      onEnd: () => {
        if (drawing.handle === undefined || handles.current.comparison !== drawing.handle) return;
        const listed = handles.current.changes;
        handles.current = {};
        listed?.close();
        review.close();
      },
    });
    drawing.handle = drawn;
    const listed = host.store.openChanges({ kind: 'proposal', ...changes });
    handles.current = { comparison: drawn, changes: listed };
  }, [reviewing, shown, comparison, ticked, comparisons, host, review, byKey, t]);

  // The review ends with the shell.
  useEffect(
    () => () => {
      const { comparison: drawn, changes: listed } = handles.current;
      handles.current = {};
      drawn?.end();
      listed?.close();
    },
    [],
  );
  return null;
}
