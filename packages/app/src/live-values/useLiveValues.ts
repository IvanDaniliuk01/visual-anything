/**
 * What the shell does with live values (ADR 0057): it makes the attribute lookup of each moment,
 * from the live values the program sent and what package code computed, and the scene the canvas
 * draws with them in the details of shapes and in the view's overlays.
 */
import type { Definitions, ProjectSnapshot } from '@visual-anything/core';
import { useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { setHidden } from '../canvas/navigation';
import type { Scene } from '../canvas/scene';
import { NO_CODE, type CodeStore } from '../code/context';
import type { EmphasisStore } from '../editor/emphasis';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import { NO_LIVE_VALUES, type LiveView } from './book';
import { liveSceneOf } from './details';
import { AttributeLookup } from './lookup';

const NONE = (): (() => void) => () => {};
const noValues = (): LiveView => NO_LIVE_VALUES;

/** The attribute lookup of this moment: a new one whenever live or computed values change. */
export function useLookup(code: CodeStore): AttributeLookup {
  const live = useContext(LiveContext);
  const book = live?.liveValues;
  const values = useSyncExternalStore(book?.subscribe ?? NONE, book?.current ?? noValues, noValues);
  const computed = useSyncExternalStore(code.subscribe, code.snapshot, () => NO_CODE).elements;
  return useMemo(() => new AttributeLookup(values, computed), [values, computed]);
}

/**
 * The scene the canvas draws: the view's scene with the lookup's values in the details of shapes and
 * in its overlays. What the canvas hides of it is what it hides of the view's scene, which the keys
 * skip.
 */
export function useLiveScene(
  scene: Scene | undefined,
  project: ProjectSnapshot,
  definitions: Definitions,
  lookup: AttributeLookup,
  emphasis: EmphasisStore,
): Scene | undefined {
  const t = useT();
  const live = useMemo(
    () => (scene === undefined ? undefined : liveSceneOf(scene, project, definitions, lookup, t)),
    [scene, project, definitions, lookup, t],
  );
  useEffect(() => {
    if (live === undefined || live === scene) return;
    const tell = () => setHidden(live, emphasis.get().hidden);
    tell();
    const stop = emphasis.subscribe(tell);
    return () => {
      stop();
      setHidden(live, undefined);
    };
  }, [live, scene, emphasis]);
  return live;
}
