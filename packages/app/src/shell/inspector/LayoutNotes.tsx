import type { ViewFile } from '@visual-anything/schema';
import { useId, useState } from 'react';
import { pinnedInTheWay, unpinCommand } from '../../canvas/layout/pinnedInTheWay';
import type { Scene } from '../../canvas/scene';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';

/** How many pinned shapes in the way the list names; the rest are counted. */
const NAMED = 8;

/**
 * What the view's details say of how its layout reads (ADR 0080): the curved lines it draws with
 * rounded corners, and why; and the pinned shapes in the way of Layout, which the canvas outlines,
 * with one action that unpins them all.
 */
export function LayoutNotes({ view, scene }: { view: ViewFile; scene: Scene }) {
  const t = useT();
  const { send } = useEditor();
  const heading = useId();
  const [message, setMessage] = useState({ text: '', count: 0 });
  let many = 0;
  let crossing = 0;
  for (const line of scene.relations) {
    if (line.rounded === 'many') many += 1;
    else if (line.rounded === 'crossing') crossing += 1;
  }
  const inTheWay = pinnedInTheWay(scene);
  if (many === 0 && crossing === 0 && inTheWay.length === 0) return null;
  const command = send
    ? unpinCommand(
        view,
        inTheWay.map(({ shape }) => shape),
      )
    : undefined;
  const unpin = async () => {
    if (!send || !command) return;
    try {
      const result = await send(command);
      if (!result.ok) return;
      setMessage((last) => ({
        text: t(
          {
            one: 'Unpinned 1 shape: Layout can place it now.',
            other: 'Unpinned {count} shapes: Layout can place them now.',
          },
          { count: inTheWay.length },
        ),
        count: last.count + 1,
      }));
    } catch {
      // A refusal is already shown as a notice.
    }
  };
  return (
    <section className="inspector-layout-notes" aria-labelledby={heading}>
      <h4 id={heading}>{t('How it reads')}</h4>
      {many > 0 && (
        <p className="inspector-notes">
          {t('Drawn with rounded corners: {count} lines are too many to follow as curves', {
            count: many,
          })}
        </p>
      )}
      {crossing > 0 && (
        <p className="inspector-notes">
          {t(
            {
              one: 'Drawn with rounded corners: 1 curve would cross other shapes',
              other: 'Drawn with rounded corners: {count} curves would cross other shapes',
            },
            { count: crossing },
          )}
        </p>
      )}
      {inTheWay.length > 0 && (
        <>
          <p className="inspector-notes">
            {t(
              {
                one: '1 pinned shape is in the way of Layout, outlined on the canvas:',
                other: '{count} pinned shapes are in the way of Layout, outlined on the canvas:',
              },
              { count: inTheWay.length },
            )}
          </p>
          <ul className="inspector-pinned">
            {inTheWay.slice(0, NAMED).map(({ shape, overlaps, holdsRelated }) => (
              <li key={shape.key}>
                {holdsRelated
                  ? t('"{name}" keeps Layout from placing what it holds', { name: shape.name })
                  : t('"{name}" stays over "{other}"', {
                      name: shape.name,
                      other: overlaps[0]?.name ?? '',
                    })}
              </li>
            ))}
            {inTheWay.length > NAMED && (
              <li>{t('…and {count} more', { count: inTheWay.length - NAMED })}</li>
            )}
          </ul>
          <button
            type="button"
            className="inspector-action"
            disabled={!command}
            onClick={() => void unpin()}
          >
            {t({ one: 'Unpin it', other: 'Unpin them' }, { count: inTheWay.length })}
          </button>
        </>
      )}
      <p role="status" className="visually-hidden">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
    </section>
  );
}
