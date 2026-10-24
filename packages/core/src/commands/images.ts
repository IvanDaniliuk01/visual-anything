/**
 * Commands on images: defining one in one of the project's own packages, and removing one that no
 * appearance shows. The core cleans every image before it stores it, whoever sends it, and stores only
 * what cleaning gives.
 */
import type { Appearance, Id, ImageDefinition } from '@visual-anything/schema';
import { slug, isId } from '../ids';
import { decodeBase64, encodeBase64 } from '../images/base64';
import { readBitmap } from '../images/bitmap';
import { IMAGE_CAPS, imageUsers, imagesIn } from '../images/catalog';
import { imageText } from '../images/cleaned';
import { cleanSvg } from '../images/svg';
import type { Operation } from '../operations';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { Rejection, count, reject, requireName, type Draft } from './draft';
import type { DefineImageCommand, RemoveImageCommand } from './types';

/** The longest base64 a command may send for a bitmap, before its metadata is dropped. */
const BITMAP_INPUT = 4 * 1024 * 1024;

const FORMATS = new Set(['png', 'jpeg', 'webp']);
const COLOR = /^#[0-9a-fA-F]{6}$/;

export function defineImage(draft: Draft, command: DefineImageCommand): string {
  const file = draft.ownPackage(command.package);
  const asked = command.image as Partial<Record<string, unknown>> | null | undefined;
  if (typeof asked !== 'object' || asked === null) {
    reject('invalid-command', 'define-image needs the image to define.');
  }
  const name = requireName(asked.name, 'An image');
  if (name.length > IMAGE_CAPS.name) {
    reject('invalid-command', `An image's name has at most ${IMAGE_CAPS.name} characters.`);
  }
  const source = asked.source;
  if (source !== undefined && (typeof source !== 'string' || source.length > IMAGE_CAPS.source)) {
    reject(
      'invalid-command',
      `Where an image comes from is text of at most ${IMAGE_CAPS.source} characters.`,
    );
  }
  const isSvg = asked.svg !== undefined;
  const isBitmap = asked.data !== undefined || asked.format !== undefined;
  if (isSvg === isBitmap) {
    reject(
      'invalid-command',
      'An image is SVG text, or a bitmap’s format and base64 data, and not both.',
    );
  }

  const images = file.images ?? [];
  let id: Id;
  let existing: ImageDefinition | undefined;
  if (asked.id !== undefined) {
    if (!isId(asked.id))
      reject('invalid-id', `${JSON.stringify(asked.id) ?? 'undefined'} is not a valid id.`);
    id = asked.id;
    if (!id.startsWith(`${file.id}.`)) {
      reject(
        'id-outside-package',
        `The image "${id}" must start with "${file.id}.", the id of its package.`,
        [id],
      );
    }
    const defined = imagesIn(draft.state).image(id);
    if (defined && defined.package !== file.id) {
      reject('defined-twice', `The package "${defined.package}" already defines "${id}".`, [id]);
    }
    existing = images.find((each) => each.id === id);
    if (existing && command.createOnly) {
      reject('id-taken', `The package "${file.name}" already has the image "${id}".`, [id]);
    }
    if (!existing && draft.isTaken(id))
      reject('id-taken', `The id "${id}" is already taken.`, [id]);
  } else {
    id = draft.newId(`${file.id}.${slug(name, 'image')}`);
  }

  const { image, removed } = isSvg
    ? cleanedSvg(asked.svg, id, name, source)
    : cleanedBitmap(asked.format, asked.data, id, name, source);

  const next = existing
    ? images.map((each) => (each === existing ? image : each))
    : [...images, image];
  if (next.length > IMAGE_CAPS.perPackage) {
    reject(
      'image-too-large',
      `A package holds at most ${IMAGE_CAPS.perPackage} images; "${file.name}" is full.`,
      [file.id],
    );
  }
  const total = next.reduce((sum, each) => sum + imageText(each).length, 0);
  if (total > IMAGE_CAPS.packageText) {
    reject(
      'image-too-large',
      `The images of the package "${file.name}" would hold over 2 MiB; keep fewer or smaller pictures there.`,
      [file.id],
    );
  }

  const collection = { name: 'images', package: file.id } as const;
  draft.apply(
    existing
      ? { op: 'replace', collection, item: image }
      : { op: 'insert', collection, index: images.length, item: image },
  );
  if (!existing) draft.created.push(id);
  if (removed.length > 0) {
    draft.warnings.push(
      problem('image-cleaned', `Cleaning the image "${name}" removed: ${removed.join(', ')}.`, [
        id,
      ]),
    );
  }
  return `${existing ? 'Replace' : 'Add'} the image "${name}"`;
}

export function removeImage(draft: Draft, command: RemoveImageCommand): string {
  const defined = imagesIn(draft.state).image(command.id);
  if (!defined) {
    reject('unknown-image', `No package in use defines the image "${String(command.id)}".`, [
      command.id,
    ]);
  }
  draft.ownPackage(defined.package);
  const users = imageUsers(draft.state, command.id);
  if (users.length > 0) {
    reject(
      'in-use',
      `The image "${defined.definition.name}" cannot be removed: ${count(users.length, 'component or element', 'components or elements')} show it.`,
      users,
    );
  }
  draft.apply({
    op: 'remove',
    collection: { name: 'images', package: defined.package },
    key: command.id,
  });
  return `Remove the image "${defined.definition.name}"`;
}

function cleanedSvg(
  svg: unknown,
  id: Id,
  name: string,
  source: string | undefined,
): { image: ImageDefinition; removed: readonly string[] } {
  if (typeof svg !== 'string') reject('invalid-command', 'An SVG image is given as text.');
  const result = cleanSvg(svg);
  if (!result.ok) refuse(result.problem, name);
  const { width, height } = result.value;
  return {
    image: {
      kind: 'svg',
      id,
      name,
      ...(source === undefined ? {} : { source }),
      width,
      height,
      svg: result.value.svg,
    },
    removed: result.removed,
  };
}

function cleanedBitmap(
  format: unknown,
  data: unknown,
  id: Id,
  name: string,
  source: string | undefined,
): { image: ImageDefinition; removed: readonly string[] } {
  if (typeof format !== 'string' || !FORMATS.has(format)) {
    reject(
      'invalid-command',
      'A bitmap is a PNG, a JPEG or a WebP picture: its format is "png", "jpeg" or "webp".',
    );
  }
  if (typeof data !== 'string')
    reject('invalid-command', 'A bitmap is given as its bytes in base64.');
  if (data.length > BITMAP_INPUT) {
    reject('image-too-large', 'The bitmap is far over 192 KiB; shrink it before adding it.');
  }
  const bytes = decodeBase64(data);
  if (bytes === undefined)
    reject('invalid-image', `The image "${name}" is refused: its data is not base64.`);
  const result = readBitmap(bytes, format as 'png' | 'jpeg' | 'webp');
  if (!result.ok) refuse(result.problem, name);
  const { width, height } = result.value;
  return {
    image: {
      kind: 'bitmap',
      id,
      name,
      ...(source === undefined ? {} : { source }),
      format: format as 'png' | 'jpeg' | 'webp',
      width,
      height,
      data: encodeBase64(result.value.bytes),
    },
    removed: result.removed,
  };
}

function refuse(cause: Problem, name: string): never {
  throw new Rejection([problem(cause.code, `The image "${name}" is refused: ${cause.message}`)]);
}

/**
 * Checks what a command did to the images shown, once it is done, whichever commands it ran: every
 * image an appearance comes to show must be one a package in use defines, written as an image
 * reference; and no image that an appearance still shows may go, with its package or on its own.
 */
export function checkImageReferences(
  before: ProjectSnapshot,
  after: ProjectSnapshot,
  operations: readonly Operation[],
): void {
  if (operations.length === 0) return;
  const elements = new Set<Id>();
  const components = new Set<Id>();
  for (const operation of operations) {
    if (operation.op === 'set-world') elements.add(operation.world.id);
    if (operation.op === 'insert' || operation.op === 'replace' || operation.op === 'replace-all') {
      const items = operation.op === 'replace-all' ? operation.items : [operation.item];
      const name = operation.collection.name;
      if (name === 'elements' || name === 'components') {
        for (const item of items)
          (name === 'elements' ? elements : components).add((item as { id: Id }).id);
      }
    }
  }

  const catalog = imagesIn(after);
  const checkShown = (
    appearance: Appearance | undefined,
    was: Appearance | undefined,
    owner: string,
    subject: Id,
  ) => {
    const image: unknown = appearance?.image;
    if (image === undefined || image === 'none') return;
    if (JSON.stringify(image) === JSON.stringify(was?.image)) return;
    checkWellFormed(image, owner);
    const { image: id } = image as { image: Id };
    if (!catalog.image(id)) {
      reject(
        'unknown-image',
        `${owner} cannot show the image "${id}": no package in use defines it.`,
        [subject],
      );
    }
  };
  if (elements.size > 0) {
    const now = modelIndexOf(after);
    const then = modelIndexOf(before);
    for (const id of elements) {
      const element = now.element(id);
      if (element)
        checkShown(
          element.appearance,
          then.element(id)?.appearance,
          `The element "${element.name}"`,
          id,
        );
    }
  }
  if (components.size > 0) {
    const now = definitionsIn(after).components;
    const then = definitionsIn(before).components;
    for (const id of components) {
      const component = now.get(id)?.definition;
      if (component) {
        checkShown(
          component.appearance,
          then.get(id)?.definition.appearance,
          `The component "${component.name}"`,
          id,
        );
      }
    }
  }

  if (before.packages === after.packages) return;
  for (const id of imagesIn(before).images.keys()) {
    if (catalog.images.has(id)) continue;
    const users = imageUsers(after, id);
    if (users.length > 0) {
      reject(
        'in-use',
        `The image "${id}" cannot go: ${count(users.length, 'component or element', 'components or elements')} still show it.`,
        users,
      );
    }
  }
}

/** Checks that an appearance's image is a reference: an image id, a placement and a tint at most. */
function checkWellFormed(image: unknown, owner: string): void {
  const malformed = () =>
    reject(
      'invalid-command',
      `${owner} can show an image by its id, as an icon or a drawing, with a #rrggbb tint, or show "none".`,
    );
  if (typeof image !== 'object' || image === null || Array.isArray(image)) malformed();
  const { image: id, placement, tint, ...rest } = image as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || !isId(id)) malformed();
  if (placement !== undefined && placement !== 'icon' && placement !== 'drawing') malformed();
  if (tint !== undefined && (typeof tint !== 'string' || !COLOR.test(tint))) malformed();
}
