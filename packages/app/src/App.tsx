import { useLiveProject, type LiveProblem } from './live/useLiveProject';
import { ProjectErrorBoundary } from './shell/ProjectErrorBoundary';
import { Shell } from './shell/Shell';
import { StatusScreen } from './shell/StatusScreen';

interface AppProps {
  /** This session's token, or null when the tab has none. */
  token: string | null;
}

const OPEN_THE_ADDRESS =
  'Open the address Visual Anything printed in the terminal: it carries this session’s token.';

const CLOSED =
  'The connection to Visual Anything closed, so what you see may be out of date. Start Visual Anything again and open the address it prints in the terminal.';

/** The app: the shell once the local program has sent the project, a status screen until then. */
export function App({ token }: AppProps) {
  const live = useLiveProject(token);
  switch (live.status) {
    case 'connecting':
      return (
        <StatusScreen tone="progress" title="Connecting to Visual Anything…">
          <p>Waiting for the local program to send the project.</p>
        </StatusScreen>
      );
    case 'open':
    case 'closed':
      // The same shell stays mounted when the connection closes; only the notice appears.
      return (
        <ProjectErrorBoundary>
          <Shell project={live.project} notice={live.status === 'closed' ? CLOSED : undefined} />
        </ProjectErrorBoundary>
      );
    case 'failed':
      return <Failure problem={live.problem} detail={live.detail} />;
  }
}

function Failure({ problem, detail }: { problem: LiveProblem; detail: string | undefined }) {
  switch (problem) {
    case 'no-token':
      return (
        <StatusScreen tone="problem" title="This tab has no session token">
          <p>Visual Anything only connects to the tab it opened. {OPEN_THE_ADDRESS}</p>
        </StatusScreen>
      );
    case 'refused':
      return (
        <StatusScreen tone="problem" title="Visual Anything refused the connection">
          <p>
            It may not be running, or this tab holds the token of an earlier session. Start Visual
            Anything if needed, then open the address Visual Anything printed in the terminal: it
            carries this session’s token.
          </p>
        </StatusScreen>
      );
    case 'unreadable':
      return (
        <StatusScreen tone="problem" title="Visual Anything sent something this app cannot read">
          {detail !== undefined && <p className="status-detail">{detail}</p>}
          <p>
            The app and the local program may come from different versions. Restart Visual Anything
            and open the address it prints in the terminal.
          </p>
        </StatusScreen>
      );
  }
}
