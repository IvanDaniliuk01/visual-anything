import type { LiveFailure } from './live/connection';
import { useLive } from './live/context';
import { LiveProvider } from './live/LiveProvider';
import { Notices } from './shell/Notices';
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

/**
 * The app: the shell once the local program has sent the project, a status screen until then, and the
 * notices of the live session over either.
 */
export function App({ token }: AppProps) {
  return (
    <LiveProvider token={token}>
      <LiveApp />
      <Notices />
    </LiveProvider>
  );
}

function LiveApp() {
  const { failure, project, status } = useLive();
  if (failure !== undefined) return <Failure failure={failure} />;
  if (project === undefined) {
    return (
      <StatusScreen tone="progress" title="Connecting to Visual Anything…">
        <p>Waiting for the local program to send the project.</p>
      </StatusScreen>
    );
  }
  // The same shell stays mounted when the connection closes, and while it reconnects to get a fresh
  // copy of the project; only the notice appears.
  return (
    <ProjectErrorBoundary>
      <Shell project={project} notice={status === 'closed' ? CLOSED : undefined} />
    </ProjectErrorBoundary>
  );
}

function Failure({ failure }: { failure: LiveFailure }) {
  switch (failure.reason) {
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
          {failure.detail !== undefined && <p className="status-detail">{failure.detail}</p>}
          <p>
            The app and the local program may come from different versions. Restart Visual Anything
            and open the address it prints in the terminal.
          </p>
        </StatusScreen>
      );
  }
}
