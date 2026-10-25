/**
 * Follows destinations for what it holds, inside an editor (ADR 0056): what the shell does with
 * `useFollower`, for parts shown on their own, as tests show them.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useEditor } from '../editor/EditorContext';
import { FollowDialog } from './FollowDialog';
import { FollowContext, openPage, useFollower, type GoToState, type OpenPage } from './follower';

interface FollowProviderProps {
  /** Goes to a view state in this tab, as a view address does. */
  goTo?: GoToState;
  /** How a web address opens; a new tab, by default. Tests give their own. */
  open?: OpenPage;
  children: ReactNode;
}

export function FollowProvider({ goTo, open = openPage, children }: FollowProviderProps) {
  const { project } = useEditor();
  const target = useRef<GoToState | undefined>(goTo);
  useLayoutEffect(() => {
    target.current = goTo;
  });
  const { follower, asking } = useFollower(project, target, open);
  return (
    <FollowContext value={follower}>
      {children}
      {asking && (
        <FollowDialog plan={asking.plan} onConfirm={asking.confirm} onCancel={asking.cancel} />
      )}
    </FollowContext>
  );
}
