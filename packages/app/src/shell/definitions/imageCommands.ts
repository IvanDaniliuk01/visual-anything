/**
 * The actions the image picker sends (docs/designs/components.md §5.4): one gesture is one action.
 *
 * - **A component's picture** goes in the component's own package: `define-image`, create-only, with
 *   an id the app makes, then the component's appearance shows it.
 * - **An element's own picture** goes in one of the project's own packages: the one that defines the
 *   element's component when it is the project's own, otherwise the first of them, otherwise a new
 *   one named after the project, created in the same action.
 * - **A picture already in the project** is shown by its id: nothing is defined again. Content equal
 *   to an image the target package already holds reuses that image's id the same way.
 */
import {
  builtinPackage,
  componentImage,
  definitionIdFor,
  definitionsIn,
  imageWithContent,
  imagesIn,
  randomIds,
  type AppearanceChanges,
  type BatchCommand,
  type Command,
  type IdGenerator,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { AppearanceImage, Element, Id } from '@visual-anything/schema';
import type { PreparedImage } from './imageFiles';
import { proposedPackageId, takenIn } from './commands';

/** A picture the person chose, prepared and cleaned, ready to be defined. */
export type NewPicture = Extract<PreparedImage, { ok: true }>;

/** How an appearance shows a picture: which one, where, and as a silhouette of which colour. */
export type ShownImage = AppearanceImage;

/** A new id for an image of a package, unused by anything in the project, images included. */
export function newImageId(
  project: ProjectSnapshot,
  packageId: Id,
  name: string,
  generate: IdGenerator = randomIds(),
): Id {
  const taken = takenIn(project);
  const images = imagesIn(project).images;
  return definitionIdFor(packageId, name, generate, (id) => taken(id) || images.has(id));
}

/** The project's own packages, which can hold images, in the project's order. */
export function ownPackages(project: ProjectSnapshot): Id[] {
  return project.packages.filter((file) => !builtinPackage(file.id)).map((file) => file.id);
}

/**
 * Where an element's own picture goes: the package of its component when the project owns it, the
 * first package of the project's own, or a new one named after the project.
 */
export function elementImagePackage(
  project: ProjectSnapshot,
  element: Element,
): { package: Id; create?: { id: Id; name: string } } {
  const own = ownPackages(project);
  const component = definitionsIn(project).components.get(element.component);
  if (component && own.includes(component.package)) return { package: component.package };
  const first = own[0];
  if (first !== undefined) return { package: first };
  const name = project.project.name;
  const id = proposedPackageId(project, name);
  return { package: id, create: { id, name } };
}

/**
 * The commands that define a new picture in a package, and the id it is shown by: none when the
 * package already holds equal content, whose id is then shown.
 */
export function definePicture(
  project: ProjectSnapshot,
  packageId: Id,
  picture: NewPicture,
  generate: IdGenerator = randomIds(),
): { id: Id; commands: Command[] } {
  const same = imageWithContent(project, packageId, picture.content);
  if (same) return { id: same.definition.id, commands: [] };
  const id = newImageId(project, packageId, picture.name, generate);
  return {
    id,
    commands: [
      {
        type: 'define-image',
        package: packageId,
        image: { id, name: picture.name, ...picture.content },
        createOnly: true,
      },
    ],
  };
}

/** How the image is shown, with a placement and tint, as an appearance stores it. */
function shown(id: Id, placement: ShownImage['placement'], tint: string | undefined): ShownImage {
  return {
    image: id,
    ...(placement === undefined ? {} : { placement }),
    ...(tint === undefined ? {} : { tint }),
  };
}

/** An appearance's changes that set its image, trait by trait as any other. */
export function imageChanges(image: ShownImage | 'none' | null): AppearanceChanges {
  return { image };
}

/** One command, or a batch named for the whole gesture when it takes several. */
function action(label: string, commands: Command[]): Command {
  if (commands.length === 1) return commands[0] as Command;
  const batch: BatchCommand = { type: 'batch', label, commands };
  return batch;
}

/** What the picker asks for: a new picture to define, or an image of the project shown by its id. */
export type PictureChoice =
  { kind: 'new'; picture: NewPicture } | { kind: 'existing'; id: Id } | { kind: 'same' };

export interface ShowOptions {
  placement?: ShownImage['placement'];
  tint?: string;
}

/** The action that gives a component a picture, or changes how it shows the one it has. */
export function componentImageAction(
  project: ProjectSnapshot,
  componentId: Id,
  choice: PictureChoice,
  options: ShowOptions,
  generate: IdGenerator = randomIds(),
): Command | undefined {
  const definitions = definitionsIn(project);
  const component = definitions.component(componentId);
  const packageId = definitions.components.get(componentId)?.package;
  if (!component || packageId === undefined) return undefined;
  const { id, commands } = pictureFor(
    project,
    packageId,
    choice,
    () => componentImage(definitions, componentId),
    generate,
  );
  if (id === undefined) return undefined;
  commands.push({
    type: 'update-component',
    id: componentId,
    changes: {
      appearance: imageChanges(shown(id, options.placement, options.tint)),
    },
  });
  return action(`Set the image of "${component.name}"`, commands);
}

/** The action that gives one element a picture of its own, or changes how it shows its own. */
export function elementImageAction(
  project: ProjectSnapshot,
  element: Element,
  choice: PictureChoice,
  options: ShowOptions,
  generate: IdGenerator = randomIds(),
): Command | undefined {
  const commands: Command[] = [];
  let id: Id | undefined;
  if (choice.kind === 'new') {
    const target = elementImagePackage(project, element);
    if (target.create) commands.push({ type: 'create-package', package: target.create });
    const defined = definePicture(project, target.package, choice.picture, generate);
    id = defined.id;
    commands.push(...defined.commands);
  } else if (choice.kind === 'existing') {
    id = choice.id;
  } else {
    const own = element.appearance?.image;
    id =
      own !== undefined && own !== 'none'
        ? own.image
        : componentImage(definitionsIn(project), element.component)?.image;
  }
  if (id === undefined) return undefined;
  commands.push({
    type: 'update-element',
    id: element.id,
    changes: {
      appearanceTraits: imageChanges(shown(id, options.placement, options.tint)),
    },
  });
  return action(`Set the image of "${element.name}"`, commands);
}

/** The picture a choice shows, and what defines it first. */
function pictureFor(
  project: ProjectSnapshot,
  packageId: Id,
  choice: PictureChoice,
  current: () => ShownImage | undefined,
  generate: IdGenerator,
): { id: Id | undefined; commands: Command[] } {
  if (choice.kind === 'new') return definePicture(project, packageId, choice.picture, generate);
  if (choice.kind === 'existing') return { id: choice.id, commands: [] };
  return { id: current()?.image, commands: [] };
}
