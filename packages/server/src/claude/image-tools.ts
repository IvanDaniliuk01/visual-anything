/**
 * Claude's image tools (ADR-0027): adding a picture to one of the project's own packages, replacing
 * or removing one, and listing them. Claude passes the picture's content itself, SVG text or a
 * bitmap's bytes in base64: the local program never fetches a URL. The core cleans every picture
 * before it is stored, and the answer says what cleaning removed. Showing a picture on a component or
 * an element is an appearance trait, set with update_component and update_element.
 */
import {
  builtinPackage,
  cleanSvg,
  decodeBase64,
  definitionsIn,
  encodeBase64,
  imageUsers,
  imageWithContent,
  imagesIn,
  modelIndexOf,
  readBitmap,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ImageDefinition } from '@visual-anything/schema';
import { z } from 'zod';
import { DELETE, READ, WRITE, act, counted, fail, id, ok, tool, withoutUndefined } from './kit';
import type { Tool } from './tools';

type Format = 'png' | 'jpeg' | 'webp';

/** A picture's content, as `define-image` takes it. */
type Content = { svg: string } | { format: Format; data: string };

const content = {
  svg: z
    .string()
    .min(1)
    .optional()
    .describe('The SVG text itself, starting with <svg; never a URL or a path.'),
  format: z
    .enum(['png', 'jpeg', 'webp'])
    .optional()
    .describe('A bitmap’s format; it can be left out when data is a data: URL.'),
  data: z
    .string()
    .min(1)
    .optional()
    .describe('A bitmap’s bytes in base64, or a data:image/…;base64, URL; never a web address.'),
};

const NO_FETCHING =
  'Visual Anything never fetches anything from the network, so pass the picture itself: the SVG text in svg, or a PNG, JPEG or WebP file’s bytes in base64 in data. If you only have an address, ask the person for the file.';

const addImage = tool({
  name: 'add_image',
  title: 'Add an image',
  description: `Adds a picture to one of the project's own packages, as one undoable action: SVG text, or a small PNG, JPEG or WebP bitmap as its bytes in base64. Pass the content itself: Visual Anything never fetches anything from the network, so a URL or a path is refused. The core cleans it before it is stored, dropping anything that could run or load something (scripts, links, text, metadata such as a photo's GPS position), and the answer says what cleaning removed. Caps: SVG text up to 512 KiB, bitmaps up to 192 KiB once cleaned and 1,024 pixels a side, 128 images and 2 MiB of images in a package. A picture the package already holds is not added twice: its id comes back.

Then show it with an appearance's image trait, as an icon beside the name or as the shape's whole drawing, optionally tinted one color: update_element with appearanceTraits for one element, update_component with appearance for every element of a component.

Example: { "package": "clinic", "name": "Calendar icon", "svg": "<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 24 24\\"><rect x=\\"3\\" y=\\"5\\" width=\\"18\\" height=\\"16\\" rx=\\"2\\" fill=\\"#2F6FDE\\"/></svg>", "source": "Drawn by Claude" }
Example: { "package": "clinic", "name": "Dr. Ruiz", "format": "png", "data": "iVBORw0KGgoAAAANSUhEUgAA…" }
Then: { "id": "booking-agent", "appearanceTraits": { "image": { "image": "clinic.calendar-icon", "placement": "icon" } } } with update_element.`,
  input: {
    package: id().describe('One of the project’s own packages: create_package makes one.'),
    name: z.string().min(1).max(200),
    id: id()
      .optional()
      .describe(
        'Its id, starting with the package’s id and a dot; made from the name when left out.',
      ),
    source: z
      .string()
      .max(500)
      .optional()
      .describe('Where it comes from, such as its author and license.'),
    ...content,
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const given = contentOf(args);
    if (!given.ok) return fail(given.message);
    const own = ownPackage(state, args.package);
    if (own !== undefined) return fail(own);
    const same = sameImage(state, args.package, given.content);
    if (same !== undefined) {
      return ok({
        done: 'Nothing changed, so nothing was recorded.',
        image: same.id,
        reused: `The package already holds this picture as “${same.name}”, so no image was added: show it by its id.`,
      });
    }
    return act(
      program,
      {
        type: 'define-image',
        package: args.package,
        image: withoutUndefined({
          id: args.id,
          name: args.name,
          source: args.source,
          ...given.content,
        }),
        createOnly: true,
      },
      async (answer) => {
        const image = answer.created[0];
        const defined =
          image === undefined ? undefined : imagesIn(await program.project()).image(image);
        return {
          image,
          ...(defined ? sizeOf(defined.definition) : {}),
          cleaned: cleanedSays(answer.warnings),
          show: `Show it with update_element, appearanceTraits { "image": { "image": "${image ?? ''}", "placement": "icon" } }, or with update_component, appearance { "image": { "image": "${image ?? ''}", "placement": "drawing" } }.`,
        };
      },
      ['image-cleaned'],
    );
  },
});

const replaceImage = tool({
  name: 'replace_image',
  title: 'Replace an image',
  description: `Replaces the picture of an image of the project's own packages, or renames it, as one undoable action; every component and element that shows it shows the new picture. Pass the new content itself, as add_image takes it; it is cleaned the same way, and the answer says what cleaning removed. Left out, the picture stays and only the name or the source changes; a source of null takes it away.

Example: { "id": "clinic.calendar-icon", "svg": "<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 24 24\\"><circle cx=\\"12\\" cy=\\"12\\" r=\\"9\\" fill=\\"#2F6FDE\\"/></svg>" }
Example: { "id": "clinic.dr-ruiz", "name": "Dr. Ana Ruiz" }`,
  input: {
    id: id(),
    name: z.string().min(1).max(200).optional(),
    source: z.string().max(500).nullable().optional(),
    ...content,
  },
  hints: WRITE,
  run: async (args, program) => {
    const state = await program.project();
    const defined = imagesIn(state).image(args.id);
    if (!defined)
      return fail(`No package in use defines the image "${args.id}". list_images lists them.`);
    const own = ownPackage(state, defined.package);
    if (own !== undefined) return fail(own);
    const changesContent =
      args.svg !== undefined || args.data !== undefined || args.format !== undefined;
    if (!changesContent && args.name === undefined && args.source === undefined) {
      return fail(
        'Give something to change: the picture (svg, or format and data), a name or a source.',
      );
    }
    const given = changesContent
      ? contentOf(args)
      : { ok: true as const, content: stored(defined.definition) };
    if (!given.ok) return fail(given.message);
    const { definition } = defined;
    const source = args.source === null ? undefined : (args.source ?? definition.source);
    return act(
      program,
      {
        type: 'define-image',
        package: defined.package,
        image: withoutUndefined({
          id: definition.id,
          name: args.name ?? definition.name,
          source,
          ...given.content,
        }),
      },
      async (answer) => {
        const now = await program.project();
        const replaced = imagesIn(now).image(definition.id);
        return {
          image: definition.id,
          ...(replaced ? sizeOf(replaced.definition) : {}),
          ...(changesContent ? { cleaned: cleanedSays(answer.warnings) } : {}),
          shownBy: usersOf(now, definition.id).map((each) => each.name),
        };
      },
      ['image-cleaned'],
    );
  },
});

const removeImage = tool({
  name: 'remove_image',
  title: 'Remove an image',
  description: `Removes an image from one of the project's own packages, as one undoable action. It is refused while a component or an element shows it, and the answer names them: make them show no image first, with update_element (appearanceTraits { "image": null }) or update_component (appearance { "image": null }), then call again.

Example: { "id": "clinic.old-logo" }`,
  input: { id: id() },
  hints: DELETE,
  run: async (args, program) => {
    const state = await program.project();
    const defined = imagesIn(state).image(args.id);
    if (!defined)
      return fail(`No package in use defines the image "${args.id}". list_images lists them.`);
    const own = ownPackage(state, defined.package);
    if (own !== undefined) return fail(own);
    const users = usersOf(state, args.id);
    if (users.length > 0) {
      return fail(
        `Not removed: “${defined.definition.name}” is shown by ${counted(users.length, 'component or element', 'components and elements')}: ${users.map((each) => `${each.kind} "${each.id}" (${each.name})`).join(', ')}. Make them show no image first: update_element with appearanceTraits { "image": null }, or update_component with appearance { "image": null }; then call again.`,
      );
    }
    return act(program, { type: 'remove-image', id: args.id });
  },
});

const listImages = tool({
  name: 'list_images',
  title: 'List images',
  description: `Lists the images of the packages the project uses: each one's id, name, package, kind (SVG or bitmap), size, where it comes from, whether the canvas draws it, and the components and elements that show it. Pass id for one image only; for an SVG image, that also gives its cleaned SVG text, to change and pass to replace_image.

Example: {}
Example: { "package": "clinic" }
Example: { "id": "clinic.calendar-icon" }`,
  input: {
    package: id().optional().describe('Only the images of this package.'),
    id: id().optional().describe('Only this image, with its SVG text when it is SVG.'),
  },
  hints: READ,
  run: async (args, program) => {
    const state = await program.project();
    const catalog = imagesIn(state);
    const images = [...catalog.images].filter(
      ([imageId, defined]) =>
        (args.id === undefined || imageId === args.id) &&
        (args.package === undefined || defined.package === args.package),
    );
    if (args.id !== undefined && images.length === 0) {
      return fail(`No package in use defines the image "${args.id}".`);
    }
    return ok({
      total: images.length,
      images: images.map(([imageId, { definition, package: packageId }]) => {
        const cleaned = catalog.shown(imageId);
        return withoutUndefined({
          id: imageId,
          name: definition.name,
          package: packageId,
          builtIn: builtinPackage(packageId) !== undefined,
          kind: definition.kind,
          format: definition.kind === 'bitmap' ? definition.format : undefined,
          ...sizeOf(cleaned ?? definition),
          source: definition.source,
          drawn: cleaned !== undefined,
          shownBy: usersOf(state, imageId),
          svg: args.id !== undefined && cleaned?.kind === 'svg' ? cleaned.svg : undefined,
        });
      }),
    });
  },
});

/** Claude's image tools, in the order Claude reads them. */
export const IMAGE_TOOLS: readonly Tool[] = [addImage, replaceImage, removeImage, listImages];

// ——— Helpers ———

/** The picture a call passes, or why it cannot be used. */
function contentOf(args: {
  svg?: string | undefined;
  format?: Format | undefined;
  data?: string | undefined;
}): { ok: true; content: Content } | { ok: false; message: string } {
  const refused = (message: string) => ({ ok: false as const, message });
  if (args.svg !== undefined && (args.data !== undefined || args.format !== undefined)) {
    return refused('Give the picture once: svg for SVG text, or format and data for a bitmap.');
  }
  if (args.svg !== undefined) {
    // SVG text holds markup; an address or a path holds none.
    if (isAddress(args.svg) || !args.svg.includes('<')) return refused(NO_FETCHING);
    return { ok: true, content: { svg: args.svg } };
  }
  if (args.data === undefined) {
    return refused(`Give the picture: svg, or format and data. ${NO_FETCHING}`);
  }
  if (isAddress(args.data)) return refused(NO_FETCHING);
  let data = args.data.trim();
  let format = args.format;
  const dataUrl = /^data:image\/(png|jpe?g|webp);base64,/i.exec(data);
  if (dataUrl) {
    const named = (dataUrl[1] ?? '').toLowerCase();
    const given: Format = named === 'jpg' ? 'jpeg' : (named as Format);
    if (format !== undefined && format !== given) {
      return refused(
        `The data is a ${given.toUpperCase()} picture, not a ${format.toUpperCase()} one.`,
      );
    }
    format = given;
    data = data.slice(dataUrl[0].length);
  } else if (/^data:/i.test(data)) {
    return refused('data holds a PNG, JPEG or WebP picture in base64; give SVG text in svg.');
  }
  if (format === undefined) return refused('Give the bitmap’s format: "png", "jpeg" or "webp".');
  return { ok: true, content: { format, data: data.replace(/\s+/g, '') } };
}

/** Whether text is an address rather than a picture's content. */
function isAddress(text: string): boolean {
  return /^\s*(https?|ftp|file):/i.test(text);
}

/** Why a package cannot hold Claude's images, or undefined when it is one of the project's own. */
function ownPackage(state: ProjectSnapshot, packageId: Id): string | undefined {
  if (builtinPackage(packageId) !== undefined) {
    return `"${packageId}" is a built-in package, which the project cannot change: use one of its own packages; create_package makes one.`;
  }
  if (!state.packages.some((each) => each.id === packageId)) {
    return `The project uses no package "${packageId}": create_package makes one of its own.`;
  }
  return undefined;
}

/** The image of a package whose picture is what cleaning gives for this content. */
function sameImage(
  state: ProjectSnapshot,
  packageId: Id,
  given: Content,
): ImageDefinition | undefined {
  let cleaned: { svg: string } | { format: Format; data: string } | undefined;
  if ('svg' in given) {
    const result = cleanSvg(given.svg);
    if (result.ok) cleaned = { svg: result.value.svg };
  } else {
    const bytes = decodeBase64(given.data);
    const result = bytes === undefined ? undefined : readBitmap(bytes, given.format);
    if (result?.ok) cleaned = { format: given.format, data: encodeBase64(result.value.bytes) };
  }
  return cleaned === undefined
    ? undefined
    : imageWithContent(state, packageId, cleaned)?.definition;
}

/** An image's stored content, to send again when only its name or source changes. */
function stored(image: ImageDefinition): Content {
  return image.kind === 'svg' ? { svg: image.svg } : { format: image.format, data: image.data };
}

function sizeOf(image: { width: number; height: number }) {
  return { width: image.width, height: image.height };
}

/** What cleaning removed, as the core said it. */
function cleanedSays(warnings: readonly { code: string; message: string }[]): string {
  return (
    warnings.find((each) => each.code === 'image-cleaned')?.message ??
    'Cleaning removed nothing: the picture is stored as given.'
  );
}

/** The components and elements that show an image, each with its kind and name. */
function usersOf(state: ProjectSnapshot, imageId: Id) {
  const definitions = definitionsIn(state);
  const index = modelIndexOf(state);
  return imageUsers(state, imageId).map((user) => {
    const component = definitions.components.get(user)?.definition;
    return component
      ? { kind: 'component', id: user, name: component.name }
      : { kind: 'element', id: user, name: index.element(user)?.name ?? user };
  });
}
