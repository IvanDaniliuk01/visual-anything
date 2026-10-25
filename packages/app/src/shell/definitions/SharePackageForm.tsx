import {
  compareVersions,
  packageChanges,
  packageNeeds,
  type ListChanges,
  type PackageChanges,
  type PackageProperty,
} from '@visual-anything/core';
import type { Id, PackageFile } from '@visual-anything/schema';
import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { InlineProblem } from '../inspector/controls';
import { Detail, Title } from '../inspector/parts';
import { refusalOf } from './commands';
import { useOpenDefinition } from './opened';
import {
  addPackageCommand,
  chosenFilesOf,
  packageWithId,
  readChosenProject,
  updatePackageCommand,
  type ChosenProject,
} from './sharedPackages';
import { useSender } from './useSender';
import './share.css';

interface SharePackageFormProps {
  /** Adds a package from another project, or updates the project's own package `id` from one. */
  mode: { kind: 'add' } | { kind: 'update'; id: Id };
  titleRef: Ref<HTMLHeadingElement>;
}

/**
 * A package from another project (R39, ADR 0051): the person chooses that project's folder, then one
 * of its packages, which is added here with its images, keeping its ids; or, for a package of the
 * project's own, the folder it came from, whose version of it is shown against this one, what changed
 * listed, before it is applied as one action. What the core would refuse, such as a clash of ids, is
 * said before anything is sent.
 */
export function SharePackageForm({ mode, titleRef }: SharePackageFormProps) {
  const t = useT();
  const { project, send } = useEditor();
  const { open } = useOpenDefinition();
  const sender = useSender();
  const input = useRef<HTMLInputElement>(null);
  const packagesId = useId();
  const problemId = useId();
  const [chosen, setChosen] = useState<ChosenProject>();
  const [reading, setReading] = useState(false);
  const [picked, setPicked] = useState<Id>();
  const current =
    mode.kind === 'update' ? project.packages.find((each) => each.id === mode.id) : undefined;

  // Folder pickers are a non-standard attribute that React does not know.
  useEffect(() => {
    input.current?.setAttribute('webkitdirectory', '');
  }, []);

  const choose = async (files: FileList | null) => {
    if (files === null || files.length === 0) return;
    setReading(true);
    try {
      const read = await readChosenProject(chosenFilesOf(files));
      setChosen(read);
      setPicked(mode.kind === 'update' ? mode.id : read.packages[0]?.file.id);
    } finally {
      setReading(false);
    }
  };

  const incoming =
    chosen === undefined || picked === undefined ? undefined : packageWithId(chosen, picked)?.file;
  const command =
    incoming === undefined
      ? undefined
      : mode.kind === 'add'
        ? addPackageCommand(incoming)
        : updatePackageCommand(incoming);
  const refusal = command === undefined ? undefined : refusalOf(project, command);
  const changes =
    current !== undefined && incoming !== undefined ? packageChanges(current, incoming) : undefined;

  const apply = async () => {
    if (command === undefined || incoming === undefined) return;
    if (await sender.send(command)) open?.({ kind: 'package', id: incoming.id }, { focus: true });
  };

  const title =
    mode.kind === 'add'
      ? t('Add a package from another project')
      : t('Update “{name}” from another project', {
          name: current === undefined ? mode.id : t.definition(current.id, current.name),
        });

  return (
    <div className="definition-form share-package">
      <Title titleRef={titleRef} name={title} />
      <p className="inspector-notes">
        {mode.kind === 'add'
          ? t(
              'Choose the folder of another project, then one of its packages: it is copied here with its images, keeping its ids, so that it can be updated from there later.',
            )
          : t(
              'Choose the folder of the project this package came from: what changed there is listed before anything changes here.',
            )}
      </p>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          void choose(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <div className="definition-actions">
        <button
          type="button"
          className="inspector-action"
          disabled={send === undefined || reading}
          onClick={() => input.current?.click()}
        >
          {t('Choose a project folder…')}
        </button>
      </div>
      {reading && (
        <p className="inspector-notes" role="status">
          {t('Reading the folder…')}
        </p>
      )}

      {chosen !== undefined && (
        <section className="inspector-section" aria-labelledby={packagesId}>
          <h4 id={packagesId}>{chosen.name ?? t('A folder with no project file')}</h4>
          {chosen.problems.map((each) => (
            <p key={each.path} className="inspector-notes">
              {t('{path} could not be read: {why}', {
                path: each.path,
                why: t.message(each.message),
              })}
            </p>
          ))}
          {mode.kind === 'add' ? (
            chosen.packages.length === 0 ? (
              <p className="panel-empty">{t('That project has no package of its own.')}</p>
            ) : (
              <fieldset className="share-package-choices">
                <legend>{t('Its packages')}</legend>
                {chosen.packages.map(({ file }) => (
                  <label key={file.id} className="share-package-choice">
                    <input
                      type="radio"
                      name={`${packagesId}-package`}
                      checked={picked === file.id}
                      onChange={() => setPicked(file.id)}
                    />
                    <span className="item-name">{file.name}</span>
                    <span className="item-notes">
                      {[file.id, file.version, file.license].filter(Boolean).join(' · ')}
                    </span>
                  </label>
                ))}
              </fieldset>
            )
          ) : incoming === undefined ? (
            <p className="panel-empty">
              {t('That project has no package “{id}”.', { id: mode.id })}
            </p>
          ) : null}
        </section>
      )}

      {incoming !== undefined && (
        <section className="inspector-section">
          {mode.kind === 'add' ? (
            <AddPreview file={incoming} />
          ) : (
            current !== undefined &&
            changes !== undefined && (
              <UpdatePreview current={current} incoming={incoming} changes={changes} />
            )
          )}
          {refusal !== undefined && (
            <InlineProblem id={problemId} text={t.message(refusal.message)} />
          )}
          {sender.problem !== undefined && (
            <InlineProblem id={`${problemId}-sent`} text={sender.problem} />
          )}
          <div className="definition-actions">
            <button
              type="button"
              className="inspector-action"
              disabled={send === undefined || refusal !== undefined || changes?.same === true}
              aria-describedby={refusal === undefined ? undefined : problemId}
              onClick={() => void apply()}
            >
              {mode.kind === 'add' ? t('Add this package') : t('Apply the update')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** What adding a package brings: what it holds, its license, and the built-in packages it needs. */
function AddPreview({ file }: { file: PackageFile }) {
  const t = useT();
  const { project } = useEditor();
  const { builtIn } = packageNeeds(project, file);
  return (
    <>
      <dl className="details">
        <Credits file={file} />
        <Detail term={t('Holds')}>
          {t('{components}, {relationTypes} and {images}', {
            components: t(
              { one: '{count} component', other: '{count} components' },
              { count: file.components.length },
            ),
            relationTypes: t(
              { one: '{count} relation type', other: '{count} relation types' },
              { count: file.relationTypes.length },
            ),
            images: t(
              { one: '{count} image', other: '{count} images' },
              { count: file.images?.length ?? 0 },
            ),
          })}
        </Detail>
      </dl>
      {builtIn.length > 0 && (
        <p className="inspector-notes">
          {t('It needs the built-in packages {names}, which the project starts using with it.', {
            names: builtIn.map((id) => `“${t.definition(id, id)}”`).join(', '),
          })}
        </p>
      )}
    </>
  );
}

/** A package's version, license and attribution, where it says them. */
function Credits({ file }: { file: PackageFile }) {
  const t = useT();
  return (
    <>
      {file.version !== undefined && <Detail term={t('Version')}>{file.version}</Detail>}
      {file.license !== undefined && <Detail term={t('License')}>{file.license}</Detail>}
      {file.attribution !== undefined && (
        <Detail term={t('Attribution')}>{file.attribution}</Detail>
      )}
    </>
  );
}

/** What the preview calls each property of a package, in the language read in. */
function propertyName(t: ReturnType<typeof useT>, key: PackageProperty): string {
  switch (key) {
    case 'name':
      return t('Name');
    case 'description':
      return t('Description');
    case 'version':
      return t('Version');
    case 'license':
      return t('License');
    case 'attribution':
      return t('Attribution');
  }
}

/** What updating a package changes: its properties, then what it defines and its images. */
function UpdatePreview({
  current,
  incoming,
  changes,
}: {
  current: PackageFile;
  incoming: PackageFile;
  changes: PackageChanges;
}) {
  const t = useT();
  if (changes.same) {
    return (
      <p className="inspector-notes">{t('Nothing differs: the package is the same there.')}</p>
    );
  }
  const older = compareVersions(current.version, incoming.version) === 1;
  const none = t('none');
  return (
    <>
      {older && (
        <p className="inspector-notes">
          {t('The version there, {there}, is older than this one, {here}.', {
            there: incoming.version ?? '',
            here: current.version ?? '',
          })}
        </p>
      )}
      {changes.properties.length > 0 && (
        <dl className="details">
          {changes.properties.map((each) => (
            <Detail key={each.key} term={propertyName(t, each.key)}>
              {t('{before} → {after}', {
                before: each.before ?? none,
                after: each.after ?? none,
              })}
            </Detail>
          ))}
        </dl>
      )}
      <ChangeList heading={t('Components')} changes={changes.components} />
      <ChangeList heading={t('Relation types')} changes={changes.relationTypes} />
      <ChangeList heading={t('Images')} changes={changes.images} />
    </>
  );
}

function ChangeList({ heading, changes }: { heading: string; changes: ListChanges }) {
  const t = useT();
  const headingId = useId();
  const items = [
    ...changes.added.map((each) => t('Added: “{name}”', { name: each.name })),
    ...changes.changed.map((each) => t('Changed: “{name}”', { name: each.name })),
    ...changes.removed.map((each) => t('Removed: “{name}”', { name: each.name })),
    ...(changes.reordered ? [t('In another order')] : []),
  ];
  if (items.length === 0) return null;
  return (
    <>
      <h5 id={headingId}>{heading}</h5>
      <ul className="share-package-changes" aria-labelledby={headingId}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}
