/**
 * The Projects screen (ADR 0093): what the app shows while the local program is at home, with no
 * project open. It welcomes with the product and what it does, then opens a project from the projects
 * folder or the recent list, starts a new one in the projects folder from a sample of a world or
 * empty, and, behind "Open a folder…", opens a folder whose whole path the person types or pastes.
 * Choosing one opens it in every tab of the session.
 *
 * It is read by people who never opened a terminal, such as a doctor or a trader: each project and
 * each sample is a card with one clear button, and a new project starts in one click, named after its
 * sample unless the person gave it a name.
 */
import { builtinPackage, type HomeProject, type OfferedSample } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, useState, type FormEvent } from 'react';
import { useT, type Translator } from '../i18n';
import type { CommandResult, HomeOffer, NewProjectChoice } from '../live/connection';
import { ago, fullDate } from './ago';
import { Header, PRODUCT_NAME } from './Header';
import { ProductMark } from './icons';
import { SAMPLE_TEXTS } from './sampleTexts';
import './start.css';
import './projects.css';

export interface ProjectsScreenProps {
  offer: HomeOffer;
  /** Each absent while the connection cannot carry it. */
  openProject?: ((path: string) => Promise<CommandResult>) | undefined;
  createProject?: ((choice: NewProjectChoice) => Promise<CommandResult>) | undefined;
  forgetRecent?: ((path: string) => Promise<CommandResult>) | undefined;
  /** What the clipboard is reached through: the browser's by default. */
  writeText?: ((text: string) => Promise<void>) | undefined;
}

/** The name a new empty project takes when the person gave none. */
const MY_PROJECT = 'My project';

function browserClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
    return Promise.reject(new Error('This browser has no clipboard here.'));
  }
  return navigator.clipboard.writeText(text);
}

/** A sample's world: the first built-in package it uses besides Systems, as a project's is. */
function worldOf(packages: readonly Id[]): Id {
  return packages.find((id) => id !== 'systems' && builtinPackage(id) !== undefined) ?? 'systems';
}

/** A world's name in the language the app reads in. */
function worldName(t: Translator, world: Id | undefined): string | undefined {
  if (world === undefined) return undefined;
  return t.definition(world, builtinPackage(world)?.name ?? world);
}

/**
 * A sample's title on its card, under its world's name: "Healthcare: a clinic’s claim" reads "A
 * clinic’s claim", since the card already names the world.
 */
function cardTitle(title: string): string {
  const cut = title.indexOf(': ');
  if (cut < 0) return title;
  const rest = title.slice(cut + 2);
  return rest.charAt(0).toLocaleUpperCase() + rest.slice(1);
}

export function ProjectsScreen({
  offer,
  openProject,
  createProject,
  forgetRecent,
  writeText = browserClipboard,
}: ProjectsScreenProps) {
  const t = useT();
  const heading = useId();
  const nameId = useId();
  const nameHint = useId();
  const pathId = useId();
  const folderSummary = useId();
  const problemId = useId();
  const [busy, setBusy] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  // Each message counts, so that the same words said again are heard again.
  const [copied, setCopied] = useState({ text: '', count: 0 });

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
  /** Starts a new project, named as the person wrote, or after what it starts from. */
  const create = (key: string, fallback: string, choice: Omit<NewProjectChoice, 'name'>) =>
    void run(
      key,
      createProject === undefined
        ? undefined
        : () => createProject({ name: name.trim() === '' ? fallback : name.trim(), ...choice }),
    );

  const copyFolder = async () => {
    let text: string;
    try {
      await writeText(offer.folder);
      text = t('Copied');
    } catch {
      text = t('Could not copy: select the text and copy it by hand.');
    }
    setCopied((last) => ({ text, count: last.count + 1 }));
  };

  const disabled = busy !== undefined;
  const describedBy = problem === undefined ? undefined : problemId;
  const cannotCreate = disabled || createProject === undefined;

  const onOpenFolder = (event: FormEvent) => {
    event.preventDefault();
    if (path.trim() !== '') open('folder', path.trim());
  };

  return (
    <div className="status-screen">
      <Header />
      <main className="projects-main" aria-labelledby={heading}>
        <div className="projects-page" aria-busy={busy !== undefined}>
          <div className="projects-welcome">
            <span className="projects-mark">
              <ProductMark />
            </span>
            <div>
              <p className="projects-product">{PRODUCT_NAME}</p>
              <p className="projects-tagline">
                {t('Make any concept or system visual, and explore it.')}
              </p>
            </div>
            <h2 id={heading} className="visually-hidden">
              {t('Projects')}
            </h2>
          </div>

          {problem !== undefined && (
            <p id={problemId} className="start-problem projects-problem" role="alert">
              {problem}
            </p>
          )}

          <section className="projects-section" aria-label={t('Your projects')}>
            <div className="projects-section-head">
              <h3>{t('Your projects')}</h3>
              <div className="projects-folder-path">
                <span className="projects-muted">{t('Projects folder')}</span>
                <code className="projects-path" title={offer.folder}>
                  {offer.folder}
                </code>
                <button
                  type="button"
                  className="inspector-action projects-copy"
                  aria-label={t('Copy the projects folder’s path')}
                  onClick={() => void copyFolder()}
                >
                  {t('Copy path')}
                </button>
                <span className="visually-hidden" aria-live="polite">
                  {copied.text}
                  {copied.count % 2 === 1 ? ' ' : ''}
                </span>
              </div>
            </div>
            {offer.projects.length === 0 ? (
              <p className="projects-empty">{t('No projects yet. Start from a sample below.')}</p>
            ) : (
              <ul className="projects-grid">
                {offer.projects.map((project) => (
                  <ProjectCard
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
              <ul className="projects-grid">
                {offer.recent.map((recent) =>
                  recent.missing || recent.name === undefined ? (
                    <li key={recent.path} className="projects-card projects-missing">
                      <span className="projects-path" title={recent.path}>
                        {recent.path}
                      </span>
                      <span className="projects-muted">
                        {t('Missing: its folder is gone, or holds no project now.')}
                      </span>
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
                    <ProjectCard
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

          <section className="projects-section" aria-label={t('Start something new')}>
            <h3>{t('Start something new')}</h3>
            <div className="projects-field">
              <label htmlFor={nameId}>{t('Name of the new project')}</label>
              <input
                id={nameId}
                type="text"
                value={name}
                maxLength={200}
                aria-describedby={nameHint}
                onChange={(event) => setName(event.target.value)}
              />
              <p id={nameHint} className="projects-muted">
                {t('Optional: left empty, it takes the sample’s title, or “{name}”.', {
                  name: t(MY_PROJECT),
                })}
              </p>
            </div>
            <ul className="projects-grid projects-samples">
              {offer.samples.map((sample) => (
                <SampleCard
                  key={sample.id}
                  sample={sample}
                  disabled={cannotCreate}
                  starting={busy === sample.id}
                  describedBy={describedBy}
                  onStart={(title) => create(sample.id, title, { sample: sample.id })}
                />
              ))}
              <li className="projects-card projects-sample projects-empty-project">
                <span className="projects-world">{t('From nothing')}</span>
                <h4>{t('An empty project')}</h4>
                <p className="projects-muted">
                  {t('The built-in Systems package and one view, to fill as you go.')}
                </p>
                <button
                  type="button"
                  className="projects-start"
                  disabled={cannotCreate}
                  aria-describedby={describedBy}
                  onClick={() => create('empty', t(MY_PROJECT), { view: t('Overview') })}
                >
                  {busy === 'empty' ? t('Starting…') : t('Start an empty project')}
                </button>
              </li>
            </ul>
          </section>

          <details className="projects-open-folder" aria-labelledby={folderSummary}>
            <summary id={folderSummary}>{t('Open a folder…')}</summary>
            <form className="projects-folder" onSubmit={onOpenFolder}>
              <div className="projects-field">
                <label htmlFor={pathId}>
                  {t('The whole path of a folder that holds a project, or nothing yet')}
                </label>
                <input
                  id={pathId}
                  type="text"
                  value={path}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(event) => setPath(event.target.value)}
                />
              </div>
              <button
                type="submit"
                className="inspector-action"
                disabled={disabled || path.trim() === '' || openProject === undefined}
                aria-describedby={describedBy}
              >
                {busy === 'folder' ? t('Opening…') : t('Open this folder')}
              </button>
            </form>
          </details>
        </div>
      </main>
    </div>
  );
}

interface ProjectCardProps {
  project: HomeProject;
  showPath?: boolean;
  disabled: boolean;
  opening: boolean;
  describedBy: string | undefined;
  onOpen: () => void;
}

/** A project to open: its name, its world, how long ago it last changed, and Open. */
function ProjectCard({
  project,
  showPath,
  disabled,
  opening,
  describedBy,
  onOpen,
}: ProjectCardProps) {
  const t = useT();
  const world = worldName(t, project.world);
  return (
    <li className="projects-card">
      {world !== undefined && <span className="projects-world">{world}</span>}
      <h4 className="projects-name" title={project.name}>
        {project.name}
      </h4>
      {project.changed > 0 && (
        <span className="projects-muted" title={fullDate(t.language, project.changed)}>
          {t('Changed {ago}', { ago: ago(t.language, project.changed) })}
        </span>
      )}
      {showPath === true && (
        <span className="projects-path" title={project.path}>
          {project.path}
        </span>
      )}
      <button
        type="button"
        className="projects-start"
        disabled={disabled}
        aria-label={t('Open “{name}”', { name: project.name })}
        aria-describedby={describedBy}
        onClick={onOpen}
      >
        {opening ? t('Opening…') : t('Open project')}
      </button>
    </li>
  );
}

interface SampleCardProps {
  sample: OfferedSample;
  disabled: boolean;
  starting: boolean;
  describedBy: string | undefined;
  /** Starts from the sample; a project with no name given takes its title. */
  onStart: (title: string) => void;
}

/** A sample to start from: its world, its title, one short line, and its button. */
function SampleCard({ sample, disabled, starting, describedBy, onStart }: SampleCardProps) {
  const t = useT();
  const texts = SAMPLE_TEXTS[sample.id];
  const title = texts === undefined ? sample.name : t(texts.title);
  return (
    <li className="projects-card projects-sample">
      <span className="projects-world">{worldName(t, worldOf(sample.packages))}</span>
      <h4>{texts === undefined ? title : cardTitle(title)}</h4>
      {texts !== undefined && <p className="projects-muted">{t(texts.summary)}</p>}
      <button
        type="button"
        className="projects-start"
        disabled={disabled}
        aria-label={t('Start from the sample “{name}”', { name: title })}
        aria-describedby={describedBy}
        onClick={() => onStart(title)}
      >
        {starting ? t('Starting…') : t('Start from this sample')}
      </button>
    </li>
  );
}
