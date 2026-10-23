import { Component, type ReactNode } from 'react';
import { StatusScreen } from './StatusScreen';

interface ProjectErrorBoundaryProps {
  children: ReactNode;
}

interface ProjectErrorBoundaryState {
  error: Error | undefined;
}

/**
 * Shows what went wrong when the open project cannot be shown, instead of leaving the tab empty. The
 * local program validates project files, but the app should still fail visibly if one slips through.
 */
export class ProjectErrorBoundary extends Component<
  ProjectErrorBoundaryProps,
  ProjectErrorBoundaryState
> {
  override state: ProjectErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: unknown): ProjectErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override render() {
    if (this.state.error) {
      return (
        <StatusScreen tone="problem" title="Visual Anything could not show this project">
          <p className="status-detail">{this.state.error.message}</p>
          <p>
            Check the project’s files, then restart Visual Anything and open the link it prints.
          </p>
        </StatusScreen>
      );
    }
    return this.props.children;
  }
}
