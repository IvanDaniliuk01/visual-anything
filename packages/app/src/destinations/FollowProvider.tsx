/**
 * Following destinations (ADR 0056), for the canvas, the inspector and the element list alike. A view
 * of this project opens at once, in this tab. Another project and a web address open only after the
 * person agrees in a dialog that names the folder or the host; a web address then opens in a new tab
 * with `noopener` and `noreferrer`, and nothing ever fetches it.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Destination } from '@visual-anything/schema';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useModalFocus } from '../canvas/focus';
import { EditorContext, useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import type { GoTo } from '../view-state/applier';
import { browserAgrees, planFollow, type FollowPlan } from './follow';
import './destinations.css';

/** Follows destinations; what the provider gives the components inside it. */
export interface Follower {
  /** Follows a destination, or a value that may be one: a value that is not one opens nothing. */
  follow: (destination: Destination | unknown) => void;
}

const FollowContext = createContext<Follower | undefined>(undefined);

/**
 * The follower: a {@link FollowProvider}'s, or else the editor's, which the shell gives it; undefined
 * outside both, as in some tests.
 */
export function useFollow(): Follower | undefined {
  const provided = useContext(FollowContext);
  const editor = useContext(EditorContext);
  return provided ?? editor?.follow;
}

/** A plan that waits for the person to agree. */
type Asked = Extract<FollowPlan, { kind: 'project' | 'web' }>;

/** Opens a web address in a new tab, from which nothing of this tab can be reached. */
export type OpenPage = (url: string) => void;

const openPage: OpenPage = (url) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

/** Goes to a view state in this tab, as a view address does. */
export type GoToState = (request: GoTo) => void;

/**
 * The follower of a project, and the dialog it shows while it asks: the shell keeps both, gives the
 * follower to the editor and shows the dialog. `goTo` is read when a destination is followed, so the
 * shell can hand over its view state's after this hook.
 */
export function useFollower(
  project: ProjectSnapshot,
  goTo: RefObject<GoToState | undefined>,
  open: OpenPage = openPage,
): { follower: Follower; dialog: ReactNode } {
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
    (value: unknown) => {
      const plan = planFollow(project, value);
      if (plan === undefined) {
        notify('warning', t('This is not a destination, so it opens nothing.'));
        return;
      }
      switch (plan.kind) {
        case 'view':
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
    [project, goTo, notify, t],
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
  const dialog =
    asked === undefined ? null : (
      <FollowDialog plan={asked} onConfirm={() => confirm(asked)} onCancel={close} />
    );
  return { follower, dialog };
}

interface FollowProviderProps {
  /** Goes to a view state in this tab, as a view address does. */
  goTo?: GoToState;
  /** How a web address opens; a new tab, by default. Tests give their own. */
  open?: OpenPage;
  children: ReactNode;
}

/**
 * Follows destinations for what it holds, inside an editor: what the shell does with
 * {@link useFollower}, for parts shown on their own, as tests show them.
 */
export function FollowProvider({ goTo, open = openPage, children }: FollowProviderProps) {
  const { project } = useEditor();
  const target = useRef<GoToState | undefined>(goTo);
  useLayoutEffect(() => {
    target.current = goTo;
  });
  const { follower, dialog } = useFollower(project, target, open);
  return (
    <FollowContext value={follower}>
      {children}
      {dialog}
    </FollowContext>
  );
}

interface FollowDialogProps {
  plan: Asked;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Asks before something opens outside this tab: a web address, by its host, shown with the whole
 * address as text; or another project, by its folder. Cancel has the focus first, so that Enter alone
 * never opens anything.
 */
function FollowDialog({ plan, onConfirm, onCancel }: FollowDialogProps) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog);

  useEffect(() => {
    cancel.current?.focus();
  }, []);

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog follow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
          }
        }}
      >
        {plan.kind === 'web' ? (
          <>
            <h2 id={titleId}>{t('Open a page of {host}?', { host: plan.host })}</h2>
            <p>{t('It opens in a new tab, which cannot reach this one. Its whole address:')}</p>
            <p className="follow-address">{plan.url}</p>
          </>
        ) : (
          <>
            <h2 id={titleId}>{t('Open the project in “{folder}”?', { folder: plan.folder })}</h2>
            <p>
              {t(
                'Its folder is {path}, from this project’s folder. It opens in a tab of its own, through the Visual Anything that runs on it, which starts if none does.',
                { path: plan.project },
              )}
            </p>
            {plan.view !== undefined && (
              <p>{t('It opens at its view {view}.', { view: plan.view })}</p>
            )}
          </>
        )}
        <div className="dialog-actions">
          <button ref={cancel} type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
          <button type="button" className="dialog-confirm" onClick={onConfirm}>
            {plan.kind === 'web' ? t('Open the page') : t('Open the project')}
          </button>
        </div>
      </div>
    </div>
  );
}
