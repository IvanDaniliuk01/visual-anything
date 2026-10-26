import {
  builtinPackage,
  cleanedImage,
  imagesIn,
  partsLostByReplacing,
  type Command,
  type LostPart,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ImageDefinition } from '@visual-anything/schema';
import { useEffect, useId, useRef, useState } from 'react';
import { useModalFocus } from '../../canvas/focus';
import { useT, type PluralText } from '../../i18n';
import { IMAGE_FILE_TYPES, prepareImageFile, type PictureCodec } from './imageFiles';
import type { NewPicture } from './imageCommands';

const LOSES: PluralText = {
  one: 'The new picture lacks {count} part that an element is drawn as. Until a picture has it again, its element is drawn as an ordinary shape; undoing brings it back:',
  other:
    'The new picture lacks {count} parts that elements are drawn as. Until a picture has them again, their elements are drawn as ordinary shapes; undoing brings them back:',
};
const MORE: PluralText = { one: '…and {count} more.', other: '…and {count} more.' };

/** How many lost parts the dialog lists before it says how many more there are. */
const LISTED = 8;

interface ReplacePictureProps {
  project: ProjectSnapshot;
  /** The image whose picture is replaced. */
  image: Id;
  disabled: boolean;
  /** Sends a command; resolves to whether it was done. */
  send: (command: Command) => Promise<boolean>;
  /** Decodes and encodes pictures that must be shrunk; the browser's by default. */
  codec?: PictureCodec | undefined;
}

/**
 * Replace the picture… (ADR 0027, ADR 0067): a file chosen in place of the picture of an image of the
 * project's own packages, cleaned before anything is sent, then stored under the same id, so that
 * everything that shows the image shows the new picture and every anchor to a part it keeps stays.
 * Before it applies, it lists the anchored parts the new picture would lose, with the elements drawn
 * as them, and asks; a picture that loses none is replaced at once. One undoable action.
 */
export function ReplacePicture({ project, image, disabled, send, codec }: ReplacePictureProps) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [asking, setAsking] = useState<{ command: Command; lost: LostPart[] }>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const defined = imagesIn(project).image(image);
  if (!defined || builtinPackage(defined.package)) return null;
  const { definition } = defined;

  const replace = async (command: Command) => {
    setBusy(true);
    try {
      await send(command);
    } finally {
      setBusy(false);
    }
  };

  const choose = async (file: File | undefined) => {
    if (!file || disabled) return;
    setProblem(undefined);
    setBusy(true);
    const prepared = await prepareImageFile(file, codec, definition.name).finally(() =>
      setBusy(false),
    );
    if (!prepared.ok) {
      setProblem(t.message(prepared.message));
      return;
    }
    const command = replacing(defined.package, definition, prepared);
    const lost = partsLostByReplacing(project, image, nextPicture(definition, prepared));
    if (lost.length === 0) await replace(command);
    else setAsking({ command, lost });
  };

  return (
    <>
      <button
        type="button"
        className="inspector-action"
        disabled={disabled || busy}
        onClick={() => fileInput.current?.click()}
      >
        {t('Replace the picture…')}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_FILE_TYPES}
        hidden
        disabled={disabled || busy}
        tabIndex={-1}
        aria-hidden="true"
        aria-label={t('Replace the picture of “{name}”', { name: definition.name })}
        onChange={(event) => {
          const [file] = event.target.files ?? [];
          event.target.value = '';
          void choose(file);
        }}
      />
      {problem !== undefined && (
        <p className="inspector-problem" role="alert">
          {problem}
        </p>
      )}
      {asking && (
        <LostPartsDialog
          name={definition.name}
          lost={asking.lost}
          onConfirm={() => {
            const { command } = asking;
            setAsking(undefined);
            void replace(command);
          }}
          onCancel={() => setAsking(undefined)}
        />
      )}
    </>
  );
}

/** The anchored parts a replacement loses, and whether to replace it all the same. */
function LostPartsDialog({
  name,
  lost,
  onConfirm,
  onCancel,
}: {
  name: string;
  lost: readonly LostPart[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useModalFocus(dialog);
  useEffect(() => confirm.current?.focus(), []);
  const names = (part: LostPart) => part.elements.map((each) => `“${each.name}”`).join(', ');

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <h2 id={titleId}>{t('Replace the picture of “{name}”?', { name })}</h2>
        <p>{t(LOSES, { count: lost.length })}</p>
        <ul>
          {lost.slice(0, LISTED).map((part) => (
            <li key={part.part}>
              {t('“{part}”, drawn as {elements}', { part: part.part, elements: names(part) })}
            </li>
          ))}
          {lost.length > LISTED && <li>{t(MORE, { count: lost.length - LISTED })}</li>}
        </ul>
        <p className="dialog-note">{t('You can undo this.')}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            {t('Cancel')}
          </button>
          <button ref={confirm} type="button" className="dialog-confirm" onClick={onConfirm}>
            {t('Replace')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The command that stores a new picture under an image's id, keeping its name and source. */
function replacing(packageId: Id, definition: ImageDefinition, picture: NewPicture): Command {
  return {
    type: 'define-image',
    package: packageId,
    image: {
      id: definition.id,
      name: definition.name,
      ...(definition.source === undefined ? {} : { source: definition.source }),
      ...(definition.license === undefined ? {} : { license: definition.license }),
      ...picture.content,
    },
  };
}

/** The cleaned view the new picture would have, for the parts it keeps; none when cleaning refuses it. */
function nextPicture(definition: ImageDefinition, picture: NewPicture) {
  const { content, width, height } = picture;
  const next: ImageDefinition =
    'svg' in content
      ? { kind: 'svg', id: definition.id, name: definition.name, width, height, svg: content.svg }
      : {
          kind: 'bitmap',
          id: definition.id,
          name: definition.name,
          width,
          height,
          format: content.format,
          data: content.data,
        };
  return cleanedImage(next);
}
