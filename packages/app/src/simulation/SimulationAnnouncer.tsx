/**
 * Says each simulation run's stop to a screen reader as it happens (ADR 0085), whichever element
 * the inspector shows: which element's simulation stopped, at which tick, and why. It hears the
 * store itself, and renders only when there is a stop to say.
 */
import { modelIndexOf, type ProjectSnapshot, type SimulationStop } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { SimulationStore } from './store';
import { stopText, unavailableText } from './words';

interface SimulationAnnouncerProps {
  store: SimulationStore;
  project: ProjectSnapshot;
}

export function SimulationAnnouncer({ store, project }: SimulationAnnouncerProps) {
  const t = useT();
  const [said, setSaid] = useState('');
  const latest = useRef({ t, project });
  useEffect(() => {
    latest.current = { t, project };
  });
  useEffect(() => {
    /** The stop each run was last heard with, as a key. */
    const heard = new Map<Id, string>();
    const listen = () => {
      const { t: translator, project: now } = latest.current;
      const sentences: string[] = [];
      for (const element of [...heard.keys()]) if (!store.get(element)) heard.delete(element);
      for (const run of store.list()) {
        // A stop is said once the run shows the last tick it holds, as it plays up to it; why a
        // run cannot run, as soon as it cannot, in place of the stop that ended it.
        const reached = run.stop !== undefined && run.shown >= run.ticks.length - 1;
        const key =
          run.unavailable !== undefined
            ? `unavailable ${run.unavailable}`
            : reached && run.stop
              ? stopKey(run.stop)
              : '';
        if (heard.get(run.element) === key) continue;
        heard.set(run.element, key);
        if (key === '') continue;
        const name = modelIndexOf(now).element(run.element)?.name ?? run.element;
        const pkg = run.simulation.package;
        const reason =
          run.unavailable !== undefined
            ? unavailableText(
                translator,
                run.unavailable,
                now.packages.find((each) => each.id === pkg)?.name ?? pkg,
              )
            : run.stop
              ? stopText(translator, run.stop, run.simulation.definition)
              : '';
        sentences.push(
          translator('The simulation of “{name}” stopped. {reason}', { name, reason }),
        );
      }
      if (sentences.length > 0) setSaid(sentences.join(' '));
    };
    listen();
    return store.subscribe(listen);
  }, [store]);
  return (
    <p className="visually-hidden" aria-live="polite">
      {said}
    </p>
  );
}

function stopKey(stop: SimulationStop): string {
  return JSON.stringify(stop);
}
