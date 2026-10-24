interface HeaderProps {
  /** The open project's name; absent until a project is open. */
  projectName?: string | undefined;
  /** The open view's name; absent when no view is open. */
  viewName?: string | undefined;
}

/** The header: the product name, then the open project and view. */
export function Header({ projectName, viewName }: HeaderProps) {
  return (
    <header className="shell-header">
      <h1 className="shell-product">Visual Anything</h1>
      {projectName !== undefined && (
        <dl className="shell-context">
          <div>
            <dt>Project</dt>
            <dd>{projectName}</dd>
          </div>
          {viewName !== undefined && (
            <div>
              <dt>View</dt>
              <dd>{viewName}</dd>
            </div>
          )}
        </dl>
      )}
    </header>
  );
}
