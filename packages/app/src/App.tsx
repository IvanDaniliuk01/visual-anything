import { useCallback } from 'react';
import type { SendCommand } from './canvas/CanvasArea';
import { useT } from './i18n';
import { LanguageProvider } from './i18n/LanguageProvider';
import type { LiveFailure } from './live/connection';
import { useLive } from './live/context';
import { LiveProvider } from './live/LiveProvider';
import type { LiveCredential } from './live/session';
import { Notices } from './shell/Notices';
import { ProjectErrorBoundary } from './shell/ProjectErrorBoundary';
import { Shell } from './shell/Shell';
import { StatusScreen } from './shell/StatusScreen';

interface AppProps {
  /**
   * What this tab connects with: the session token, as a string or `{ token }`, or a launch code
   * that works once, `{ launch }`; null when the tab has neither.
   */
  token: string | LiveCredential | null;
}

const OPEN_AGAIN =
  'Press o in the terminal where Visual Anything runs to open a new tab, or start Visual Anything again.';

const CLOSED =
  'The connection to Visual Anything closed, so what you see may be out of date. Press o in the terminal where Visual Anything runs to open a new tab, or start Visual Anything again.';

/**
 * The app: the shell once the local program has sent the project, a status screen until then, and the
 * notices of the live session over either, all in the language the person reads in.
 */
export function App({ token }: AppProps) {
  return (
    <LanguageProvider>
      <LiveProvider token={token}>
        <LiveApp />
        <Notices />
      </LiveProvider>
    </LanguageProvider>
  );
}

function LiveApp() {
  const t = useT();
  const { failure, project, status, send, notify } = useLive();
  // The canvas learns whether a command was done, and the user reads why one was refused; the live
  // session already shows the rules a done command breaks that only warn.
  const onCommand = useCallback<SendCommand>(
    async (command) => {
      const result = await send(command);
      if (result.ok) return { ok: true, created: result.created };
      notify('error', result.problems.map((each) => each.message).join(' '));
      return { ok: false };
    },
    [send, notify],
  );
  if (failure !== undefined) return <Failure failure={failure} />;
  if (project === undefined) {
    return (
      <StatusScreen tone="progress" title={t('Connecting to Visual Anything…')}>
        <p>{t('Waiting for the local program to send the project.')}</p>
      </StatusScreen>
    );
  }
  // The same shell stays mounted when the connection closes, and while it reconnects to get a fresh
  // copy of the project; only the notice appears.
  return (
    <ProjectErrorBoundary>
      <Shell
        project={project}
        notice={status === 'closed' ? t(CLOSED) : undefined}
        {...(status === 'open' ? { onCommand } : {})}
      />
    </ProjectErrorBoundary>
  );
}

function Failure({ failure }: { failure: LiveFailure }) {
  const t = useT();
  switch (failure.reason) {
    case 'no-token':
      return (
        <StatusScreen tone="problem" title={t('This tab has no session token')}>
          <p>
            {t(
              'Visual Anything connects only to a tab it opened, through an address that works once.',
            )}{' '}
            {t(OPEN_AGAIN)}
          </p>
        </StatusScreen>
      );
    case 'refused':
      return (
        <StatusScreen tone="problem" title={t('Visual Anything refused the connection')}>
          <p>
            {t(
              'It may not be running, this tab may hold the token of an earlier session, or its address was already used: an address works once, within two minutes.',
            )}{' '}
            {t(OPEN_AGAIN)}
          </p>
        </StatusScreen>
      );
    case 'unreadable':
      return (
        <StatusScreen
          tone="problem"
          title={t('Visual Anything sent something this app cannot read')}
        >
          {failure.detail !== undefined && (
            <p className="status-detail">{t.message(failure.detail)}</p>
          )}
          <p>
            {t(
              'The app and the local program may come from different versions. Restart Visual Anything: it opens a new tab.',
            )}
          </p>
        </StatusScreen>
      );
  }
}
