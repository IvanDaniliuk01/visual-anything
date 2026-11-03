/**
 * The Projects screen (ADR 0093): what the app shows while the local program is at home, with no
 * project open. It opens a project from the projects folder or the recent list, starts a new one in
 * the projects folder, empty or from a sample shown by world, or opens a folder whose whole path the
 * person types or pastes. Choosing one opens it in every tab of the session.
 */
import { builtinPackage, type HomeProject, type OfferedSample } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useState, type FormEvent } from 'react';
import { useT, type Translator } from '../i18n';
import type { CommandResult, HomeOffer, NewProjectChoice } from '../live/connection';
import { Header } from './Header';
import { SAMPLE_TEXTS } from './sampleTexts';
import './start.css';
import './projects.css';

export interface ProjectsScreenProps {
  offer: HomeOffer;
  /** Each absent while the connection cannot carry it. */
  openProject?: ((path: string) => Promise<CommandResult>) | undefined;
  createProject?: ((choice: NewProjectChoice) => Promise<CommandResult>) | undefined;
  forgetRecent?: ((path: string) => Promise<CommandResult>) | undefined;
}

/** A sample's world: the first built-in package it uses besides Systems, as a project's is. */
function worldOf(packages: readonly Id[]): Id | undefined {
  return packages.find((id) => id !== 'systems' && builtinPackage(id) !== undefined);
}

/** A world's name in the language the app reads in. */
function worldName(t: Translator, world: Id | undefined): string | undefined {
  if (world === undefined) return undefined;
  return t.definition(world, builtinPackage(world)?.name ?? world);
}

/** When a project last changed, as the language writes a date and a time. */
function when(t: Translator, changed: number): string {
  return new Intl.DateTimeFormat(t.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    changed,
  );
}

export function ProjectsScreen({
  offer,
  openProject,
  createProject,
  forgetRecent,
}: ProjectsScreenProps) {
  const t = useT();
  const heading = useId();
  const nameId = useId();
  const pathId = useId();
  const problemId = useId();
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');

  const run = async (key: string, ask: (() => Promise<CommandResult>) | undefined) => {
    if (ask === undefined || busy !== undefined) return;
    setBusy(key);
    setProblem(undefined);
    const result = await ask();
    // Once a project opens this screen goes away; it stays when the program refused.
    setBusy(undefined);
    if (!result.ok) setProblem(result.problems.map((each) => t.message(each.message)).join(' '));
  };

  const open = (key: string, folder: string) =>
    void run(key, openProject === undefined ? undefined : () => openProject(folder));
  const create = (key: string, choice: Omit<NewProjectChoice, 'name'>) =>
    void run(
      key,
      createProject === undefined
        ? undefined
        : () => createProject({ name: name.trim(), ...choice }),
    );

  const disabled = busy !== undefined;
  const describedBy = problem === undefined ? undefined : problemId;
  const unnamed = name.trim() === '';

  // The samples, by world, in the order the program offers them.
  const worlds = new Map<string, OfferedSample[]>();
  for (const sample of offer.samples) {
    const world = worldOf(sample.packages) ?? 'systems';
    worlds.set(world, [...(worlds.get(world) ?? []), sample]);
  }

  const onOpenFolder = (event: FormEvent) => {
    event.preventDefault();
    if (path.trim() !== '') open('folder', path.trim());
  };

  return (
    <div className="status-screen">
      <Header />
      <main className="projects-main" aria-labelledby={heading}>
        <section className="status-card projects-card" aria-busy={busy !== undefined}>
          <h2 id={heading}>{t('Projects')}</h2>
          {problem !== undefined && (
            <p id={problemId} className="start-problem" role="alert">
              {problem}
            </p>
          )}

          <section className="projects-section" aria-label={t('Your projects')}>
            <h3>{t('Your projects')}</h3>
            {offer.projects.length === 0 ? (
              <p className="projects-muted">
                {t('No projects in {folder} yet.', { folder: offer.folder })}
              </p>
            ) : (
              <ul className="projects-list">
                {offer.projects.map((project) => (
                  <ProjectRow
                    key={project.path}
                    project={project}
                    disabled={disabled || openProject === undefined}
                    opening={busy === project.path}
                    describedBy={describedBy}
                    onOpen={() => open(project.path, project.path)}
                  />
                ))}
              </ul>
            )}
          </section>

          {offer.recent.length > 0 && (
            <section className="projects-section" aria-label={t('Recent projects')}>
              <h3>{t('Recent projects')}</h3>
              <ul className="projects-list">
                {offer.recent.map((recent) =>
                  recent.missing || recent.name === undefined ? (
                    <li key={recent.path} className="projects-row projects-missing">
                      <div className="projects-what">
                        <span className="projects-name">{recent.path}</span>
                        <span className="projects-muted">
                          {t('Missing: its folder is gone, or holds no project now.')}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="inspector-action"
                        disabled={disabled || forgetRecent === undefined}
                        aria-label={t('Remove “{name}” from the recent list', {
                          name: recent.path,
                        })}
                        onClick={() =>
                          void run(
                            `forget:${recent.path}`,
                            forgetRecent === undefined
                              ? undefined
                              : () => forgetRecent(recent.path),
                          )
                        }
                      >
                        {t('Remove from the list')}
                      </button>
                    </li>
                  ) : (
                    <ProjectRow
                      key={recent.path}
                      project={{
                        path: recent.path,
                        name: recent.name,
                        changed: recent.changed ?? 0,
                        ...(recent.world === undefined ? {} : { world: recent.world }),
                      }}
                      showPath
                      disabled={disabled || openProject === undefined}
                      opening={busy === `recent:${recent.path}`}
                      describedBy={describedBy}
                      onOpen={() => open(`recent:${recent.path}`, recent.path)}
                    />
                  ),
                )}
              </ul>
            </section>
          )}

          <section className="projects-section" aria-label={t('New project')}>
            <h3>{t('New project')}</h3>
            <label className="projects-field" htmlFor={nameId}>
              <span>{t('Name')}</span>
              <input
                id={nameId}
                type="text"
                value={name}
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <p className="projects-muted">
              {t('It is written in a folder of its name in {folder}.', { folder: offer.folder })}
            </p>
            <ul className="start-choices" aria-label={t('Ways to start')}>
              <li className="start-choice">
                <h4>{t('An empty project')}</h4>
                <p>
                  {t(
                    'It uses the built-in Systems package and has one view; the Components tab adds more packages.',
                  )}
                </p>
                <button
                  type="button"
                  className="inspector-action"
                  disabled={disabled || unnamed || createProject === undefined}
                  aria-describedby={describedBy}
                  onClick={() => create('empty', { view: t('Overview') })}
                >
                  {busy === 'empty' ? t('Starting…') : t('Start an empty project')}
                </button>
              </li>
            </ul>
            {[...worlds].map(([world, list]) => (
              <section key={world} className="projects-world" aria-label={worldName(t, world)}>
                <h4>{worldName(t, world)}</h4>
                <ul className="start-choices">
                  {list.map((sample) => {
                    const texts = SAMPLE_TEXTS[sample.id];
                    const title = texts === undefined ? sample.name : t(texts.title);
                    return (
                      <li key={sample.id} className="start-choice">
                        <h5>{title}</h5>
                        {texts !== undefined && <p>{t(texts.description)}</p>}
                        <button
                          type="button"
                          className="inspector-action"
                          disabled={disabled || unnamed || createProject === undefined}
                          aria-label={t('Start from the sample “{name}”', { name: title })}
                          aria-describedby={describedBy}
                          onClick={() => create(sample.id, { sample: sample.id })}
                        >
                          {busy === sample.id ? t('Starting…') : t('Start from this sample')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {unnamed && <p className="projects-muted">{t('Give the new project a name first.')}</p>}
          </section>

          <section className="projects-section" aria-label={t('Open a folder…')}>
            <h3>{t('Open a folder…')}</h3>
            <form className="projects-folder" onSubmit={onOpenFolder}>
              <label className="projects-field" htmlFor={pathId}>
                <span>{t('The whole path of a folder that holds a project, or nothing yet')}</span>
                <input
                  id={pathId}
                  type="text"
                  value={path}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => setPath(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="inspector-action"
                disabled={disabled || path.trim() === '' || openProject === undefined}
                aria-describedby={describedBy}
              >
                {busy === 'folder' ? t('Opening…') : t('Open')}
              </button>
            </form>
          </section>
        </section>
      </main>
    </div>
  );
}

interface ProjectRowProps {
  project: HomeProject;
  showPath?: boolean;
  disabled: boolean;
  opening: boolean;
  describedBy: string | undefined;
  onOpen: () => void;
}

/** A project to open: its name, its world, when it last changed, and Open. */
function ProjectRow({
  project,
  showPath,
  disabled,
  opening,
  describedBy,
  onOpen,
}: ProjectRowProps) {
  const t = useT();
  const world = worldName(t, project.world);
  const details = [
    ...(world === undefined ? [] : [world]),
    ...(project.changed > 0 ? [t('Changed {when}', { when: when(t, project.changed) })] : []),
  ].join(' · ');
  return (
    <li className="projects-row">
      <div className="projects-what">
        <span className="projects-name">{project.name}</span>
        {details !== '' && <span className="projects-muted">{details}</span>}
        {showPath === true && <span className="projects-muted projects-path">{project.path}</span>}
      </div>
      <button
        type="button"
        className="inspector-action"
        disabled={disabled}
        aria-label={t('Open “{name}”', { name: project.name })}
        aria-describedby={describedBy}
        onClick={onOpen}
      >
        {opening ? t('Opening…') : t('Open')}
      </button>
    </li>
  );
}
