import type { ResolvedAttachment } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT, type Translator } from '../../i18n';
import { relationLinesOf } from '../scene';
import {
  attachAutomaticallyCommand,
  resetCommand,
  routedByHand,
  styleCommand,
  viewIn,
} from './commands';
import type { RouteStyle } from './hand';
import { requestRouteEditing } from './requests';

const STYLES: readonly RouteStyle[] = ['orthogonal', 'straight', 'curved'];
const AUTOMATIC: ResolvedAttachment = { kind: 'automatic' };

/**
 * The inspector's Route section for a relation (ADR 0039): where each end of its line attaches in the
 * open view, how many bend points it has, its style, Reset route, attaching an end chosen by hand
 * automatically again, and Edit the route…, which gives the canvas the keys. Each change is one
 * command, as on the canvas.
 */
export function RouteSection({ relation }: { relation: Id }) {
  const t = useT();
  const { project, viewId, scene, send } = useEditor();
  const headingId = useId();
  const styleId = useId();
  const view = viewId === undefined ? undefined : viewIn(project, viewId);
  const line = scene ? relationLinesOf(scene).get(relation) : undefined;
  if (!view || viewId === undefined) return null;
  const disabled = send === undefined;
  const perform = (command: ReturnType<typeof resetCommand>) => {
    if (command && send) void send(command).catch(() => undefined);
  };
  const route = line?.hand?.route;
  const byHand = routedByHand(view, relation);
  const style: RouteStyle = byHand
    ? (view.routes?.[relation]?.style ?? 'orthogonal')
    : 'orthogonal';
  const drawnAlone = line !== undefined && !line.aggregate;
  const styleNames: Record<RouteStyle, string> = {
    orthogonal: t('Orthogonal'),
    straight: t('Straight'),
    curved: t('Curved'),
  };

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Route')}</h4>
      {!drawnAlone ? (
        <p className="inspector-notes">{t('This view does not draw it as a line of its own.')}</p>
      ) : (
        <>
          <dl className="details">
            <div className="detail">
              <dt>{t('Start')}</dt>
              <dd>{attachedAt(t, route?.from ?? AUTOMATIC)}</dd>
            </div>
            <div className="detail">
              <dt>{t('End')}</dt>
              <dd>{attachedAt(t, route?.to ?? AUTOMATIC)}</dd>
            </div>
            <div className="detail">
              <dt>{t('Bend points')}</dt>
              <dd>{line.hand?.bendPoints.length ?? 0}</dd>
            </div>
          </dl>
          <div className="inspector-control">
            <label htmlFor={styleId}>{t('Style')}</label>
            <select
              id={styleId}
              value={style}
              disabled={disabled}
              onChange={(event) =>
                perform(styleCommand(project, viewId, [relation], event.target.value as RouteStyle))
              }
            >
              {STYLES.map((each) => (
                <option key={each} value={each}>
                  {styleNames[each]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="inspector-action"
            disabled={disabled || !byHand}
            title={byHand ? undefined : t('It is routed automatically')}
            onClick={() => perform(resetCommand(project, viewId, [relation]))}
          >
            {t('Reset route')}
          </button>
          {!byHand && <p className="inspector-notes">{t('It is routed automatically')}</p>}
          {route && route.from.kind !== 'automatic' && (
            <button
              type="button"
              className="inspector-action"
              disabled={disabled}
              onClick={() => perform(attachAutomaticallyCommand(viewId, relation, 'from'))}
            >
              {t('Attach the start automatically')}
            </button>
          )}
          {route && route.to.kind !== 'automatic' && (
            <button
              type="button"
              className="inspector-action"
              disabled={disabled}
              onClick={() => perform(attachAutomaticallyCommand(viewId, relation, 'to'))}
            >
              {t('Attach the end automatically')}
            </button>
          )}
          <button
            type="button"
            className="inspector-action"
            disabled={disabled}
            onClick={() => requestRouteEditing(relation)}
          >
            {t('Edit the route…')}
          </button>
        </>
      )}
    </section>
  );
}

/** Where an end attaches, as the inspector says it: `At "out"`, `On the left side`, `Automatic`. */
function attachedAt(t: Translator, attachment: ResolvedAttachment): string {
  switch (attachment.kind) {
    case 'automatic':
      return t('Automatic');
    case 'connection-point':
      return t('At "{name}"', { name: attachment.name });
    case 'border':
      switch (attachment.side) {
        case 'top':
          return t('On the top side');
        case 'right':
          return t('On the right side');
        case 'bottom':
          return t('On the bottom side');
        case 'left':
          return t('On the left side');
      }
  }
}
