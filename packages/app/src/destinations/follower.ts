/**
 * Following destinations (ADR 0056), for the canvas, the inspector and the element list alike. A view
 * of this project opens at once, in this tab. Another project and a web address open only after the
 * person agrees in a dialog that names the folder or the host (`FollowDialog`); a web address then
 * opens in a new tab with `noopener` and `noreferrer`, and nothing ever fetches it.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { EditorContext } from '../editor/EditorContext';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import type { GoTo } from '../view-state/applier';
import { browserAgrees, planFollow, type FollowPlan } from './follow';

/** Follows destinations; what the shell and the provider give the components inside them. */
export interface Follower {
  /**
   * Follows a destination, or a value that may be one: a value that is not one opens nothing. With
   * `beside`, a view of this project opens in a pane beside the active one (ADR 0102).
   */
  follow: (value: unknown, options?: { beside?: boolean }) => void;
}

/** Opens a view in a pane beside the active one, with these elements selected (ADR 0102). */
export type OpenBeside = (view: Id, select: readonly Id[]) => void;

/** The follower a `FollowProvider` gives what it holds. */
export const FollowContext = createContext<Follower | undefined>(undefined);

/**
 * The follower: a `FollowProvider`'s, or else the editor's, which the shell gives it; undefined
 * outside both, as in some tests.
 */
export function useFollow(): Follower | undefined {
  const provided = useContext(FollowContext);
  const editor = useContext(EditorContext);
  return provided ?? editor?.follow;
}

/** A plan that waits for the person to agree. */
export type Asked = Extract<FollowPlan, { kind: 'project' | 'web' }>;

/** Opens a web address in a new tab, from which nothing of this tab can be reached. */
export type OpenPage = (url: string) => void;

export const openPage: OpenPage = (url) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

/** Goes to a view state in this tab, as a view address does. */
export type GoToState = (request: GoTo) => void;

/** What the follow dialog asks, while it asks, and what its two buttons do. */
export interface Asking {
  plan: Asked;
  confirm: () => void;
  cancel: () => void;
}

/**
 * The follower of a project, and what its dialog asks while it asks: the shell keeps both, gives the
 * follower to the editor and shows `FollowDialog` with what it asks. `goTo` is read when a destination is followed, so the
 * shell can hand over its view state's after this hook; so is `beside`, which opens a view beside.
 */
export function useFollower(
  project: ProjectSnapshot,
  goTo: RefObject<GoToState | undefined>,
  open: OpenPage = openPage,
  beside?: RefObject<OpenBeside | undefined>,
): { follower: Follower; asking: Asking | undefined } {
  const t = useT();
  const live = useContext(LiveContext);
  const [asked, setAsked] = useState<Asked>();
  // Where the focus was when the dialog opened, to give it back when it closes.
  const returnTo = useRef<HTMLElement | null>(null);

  const notify = useCallback(
    (level: 'info' | 'warning' | 'error', message: string) => live?.notify(level, message),
    [live],
  );

  const follow = useCallback(
    (value: unknown, options?: { beside?: boolean }) => {
      const plan = planFollow(project, value);
      if (plan === undefined) {
        notify('warning', t('This is not a destination, so it opens nothing.'));
        return;
      }
      switch (plan.kind) {
        case 'view':
          if (options?.beside === true && beside?.current) {
            beside.current(plan.view, plan.select);
            return;
          }
          goTo.current?.({
            kind: 'address',
            state: {
              view: plan.view,
              ...(plan.select.length === 0 ? {} : { select: plan.select }),
            },
          });
          return;
        case 'missing-view':
          notify(
            'warning',
            t('This destination opens the view {view}, which the project does not have.', {
              view: plan.view,
            }),
          );
          return;
        case 'project':
        case 'web': {
          const active = document.activeElement;
          returnTo.current = active instanceof HTMLElement ? active : null;
          setAsked(plan);
          return;
        }
      }
    },
    [project, goTo, beside, notify, t],
  );

  const close = useCallback(() => {
    setAsked(undefined);
    const back = returnTo.current;
    returnTo.current = null;
    if (back?.isConnected) back.focus();
  }, []);

  const confirm = useCallback(
    (plan: Asked) => {
      close();
      if (plan.kind === 'web') {
        // Read once more, by the browser that opens it: nothing it reads otherwise ever opens.
        if (!browserAgrees(plan.url, plan.host)) {
          notify('error', t('This web address does not open: the browser reads it otherwise.'));
          return;
        }
        open(plan.url);
        return;
      }
      const ask = live?.openOtherProject;
      if (ask === undefined) {
        notify('error', t('Another project opens only while Visual Anything is connected.'));
        return;
      }
      void ask(plan.project, plan.view).then((result) => {
        if (result.ok) {
          notify('info', t('“{name}” opens in a new tab.', { name: result.name }));
        } else {
          notify(
            'error',
            t('The project in “{folder}” does not open: {why}', {
              folder: plan.folder,
              why: result.problems.map((each) => t.message(each.message)).join(' '),
            }),
          );
        }
      });
    },
    [close, live, notify, open, t],
  );

  const follower = useMemo<Follower>(() => ({ follow }), [follow]);
  const asking: Asking | undefined =
    asked === undefined ? undefined : { plan: asked, confirm: () => confirm(asked), cancel: close };
  return { follower, asking };
}
