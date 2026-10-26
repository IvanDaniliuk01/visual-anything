/**
 * Live values in the inspector (ADR 0057): each value from outside that an element or a relation has
 * now, over the attribute it names, with its mark, who sent it and how old it is; a value past its
 * sender's freshness fades and says so. Keep as attribute turns one into an ordinary, undoable edit
 * of the stored attribute, one action of the person's.
 */
import { liveAge, type LiveValue } from '@visual-anything/core';
import type { Id, JsonValue } from '@visual-anything/schema';
import { useEffect, useId, useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { perform } from '../shell/inspector/send';
import { sameJson } from '../shell/inspector/attributes';
import { useAttributeLookup } from './context';
import type { Attributed } from './lookup';
import { keepCommand } from './keep';
import { ageWords, senderWords } from './words';
import './live-values.css';

/** How often the ages the section says move on, in milliseconds. */
const TICK_MS = 1000;

export function LiveValuesSection({ item }: { item: Attributed }) {
  const t = useT();
  const lookup = useAttributeLookup();
  const { project, send } = useEditor();
  const headingId = useId();
  const id = item.kind === 'element' ? item.element.id : item.relation.id;
  const live = lookup.liveOf(id);
  const now = useNow(live !== undefined && live.size > 0, lookup.now);
  if (live === undefined || live.size === 0) return null;
  const own = item.kind === 'element' ? item.element.attributes : item.relation.attributes;
  const packageName = (pkg: Id) => project.packages.find((each) => each.id === pkg)?.name ?? pkg;

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Live values')}</h4>
      <p className="live-values-note">
        {t('They come from outside while the project is open, and are never saved.')}
      </p>
      <ul className="live-values" aria-labelledby={headingId}>
        {[...live.values()].map((value) => (
          <LiveRow
            key={value.attribute}
            value={value}
            now={now}
            stored={
              own !== undefined && Object.hasOwn(own, value.attribute)
                ? own[value.attribute]
                : undefined
            }
            sender={senderWords(t, value.sender, packageName)}
            disabled={send === undefined}
            onKeep={() => void perform(send, keepCommand(item, value.attribute, value.value))}
          />
        ))}
      </ul>
    </section>
  );
}

interface LiveRowProps {
  value: LiveValue;
  now: number;
  stored: JsonValue | undefined;
  sender: string;
  disabled: boolean;
  onKeep: () => void;
}

function LiveRow({ value, now, stored, sender, disabled, onKeep }: LiveRowProps) {
  const t = useT();
  const age = liveAge(value, now);
  const kept = stored !== undefined && sameJson(stored, value.value);
  return (
    <li className={age.stale ? 'live-value live-value-stale' : 'live-value'}>
      <span className="live-value-name">{value.attribute}</span>
      <span className="live-value-text">{valueText(value.value)}</span>
      <span className="live-mark" title={t('A live value from {sender}, never saved.', { sender })}>
        {age.stale ? t('live, stale') : t('live')}
      </span>
      <span className="live-value-age">
        {age.stale
          ? t('From {sender}, {age}: older than it stays fresh.', {
              sender,
              age: ageWords(t, age.age),
            })
          : t('From {sender}, {age}.', { sender, age: ageWords(t, age.age) })}
      </span>
      {stored !== undefined && !kept && (
        <span className="live-value-stored">
          {t('Stored: {value}', { value: valueText(stored) })}
        </span>
      )}
      <button
        type="button"
        className="inspector-action"
        disabled={disabled || kept}
        title={kept ? t('The stored value is this one already.') : undefined}
        onClick={onKeep}
      >
        {t('Keep as attribute')}
      </button>
    </li>
  );
}

/** The time now, moving on every second while there is something whose age to say. */
function useNow(ticking: boolean, since: number): number {
  const [now, setNow] = useState(() => Math.max(since, Date.now()));
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [ticking]);
  return Math.max(now, since);
}

function valueText(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
