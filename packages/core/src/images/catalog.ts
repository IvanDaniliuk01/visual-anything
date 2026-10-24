/**
 * The images of the packages a project uses, and which appearances show them. An appearance names an
 * image by id; a component inherits the image of the nearest definition in its chain that sets one, an
 * element's own appearance comes first, and `none` stops an inherited image.
 */
import type {
  Appearance,
  AppearanceImage,
  Element,
  Id,
  ImageDefinition,
  PackageFile,
} from '@visual-anything/schema';
import type { Defined, Definitions } from '../definitions';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { cleanedImage, imageText, pruneCleanedImages, type CleanedImage } from './cleaned';

/** The caps on a package's images, besides each image's own. */
export const IMAGE_CAPS = {
  /** Images in one package. */
  perPackage: 128,
  /** Characters of image text (SVG text and base64) in one package; images past it are not drawn. */
  packageText: 2 * 1024 * 1024,
  /** From this many characters in one package, opening it warns. */
  packageWarning: 1024 * 1024,
  /** Characters of an image's name. */
  name: 200,
  /** Characters of where an image comes from. */
  source: 500,
} as const;

/** The images of a set of packages. */
export interface ImageCatalog {
  /** Every image the packages define, by id; the first one when an id is defined twice. */
  readonly images: ReadonlyMap<Id, Defined<ImageDefinition>>;
  /** The image a package in use defines with this id. */
  image(id: Id): Defined<ImageDefinition> | undefined;
  /**
   * The cleaned view of an image to draw: defined, accepted by cleaning, and within its package's
   * total; `undefined` otherwise. Every reader uses only this.
   */
  shown(id: Id): CleanedImage | undefined;
  /** The images past their package's total, in file order: they are not drawn. */
  readonly pastTotal: ReadonlySet<Id>;
  /** Images defined twice, or whose ids do not start with their package's id. */
  readonly problems: readonly Problem[];
}

const catalogs = new WeakMap<readonly PackageFile[], ImageCatalog>();

/** The images of the given packages. Repeated calls with the same array share the result. */
export function imagesOf(packages: readonly PackageFile[]): ImageCatalog {
  let catalog = catalogs.get(packages);
  if (!catalog) {
    catalog = buildCatalog(packages);
    catalogs.set(packages, catalog);
  }
  return catalog;
}

/** The images of the packages a project uses. */
export function imagesIn(state: ProjectSnapshot): ImageCatalog {
  return imagesOf(state.packages);
}

function buildCatalog(packages: readonly PackageFile[]): ImageCatalog {
  const images = new Map<Id, Defined<ImageDefinition>>();
  const pastTotal = new Set<Id>();
  const problems: Problem[] = [];
  for (const file of packages) {
    let total = 0;
    for (const image of file.images ?? []) {
      total += imageText(image).length;
      if (total > IMAGE_CAPS.packageText) pastTotal.add(image.id);
      const first = images.get(image.id);
      if (first) {
        problems.push(
          problem(
            'defined-twice',
            `The image "${image.id}" is defined by package "${first.package}" and again by "${file.id}".`,
            [image.id, file.id],
          ),
        );
        continue;
      }
      if (!image.id.startsWith(`${file.id}.`)) {
        problems.push(
          problem(
            'id-outside-package',
            `The image "${image.id}" of package "${file.id}" should start with "${file.id}.".`,
            [image.id, file.id],
          ),
        );
      }
      images.set(image.id, { definition: image, package: file.id });
    }
  }
  pruneCleanedImages([...images.values()].map((each) => each.definition));
  return {
    images,
    image: (id) => images.get(id),
    shown: (id) => {
      const defined = images.get(id);
      return defined && !pastTotal.has(id) ? cleanedImage(defined.definition) : undefined;
    },
    pastTotal,
    problems,
  };
}

/**
 * The image an appearance chain shows, nearest first: the nearest one that sets an image, or none
 * when that one says `none` or no one sets one.
 */
export function resolveImage(
  chain: readonly (Appearance | undefined)[],
): AppearanceImage | undefined {
  for (const appearance of chain) {
    const image = appearance?.image;
    if (image === 'none') return undefined;
    if (image !== undefined) return image;
  }
  return undefined;
}

const componentImages = new WeakMap<Definitions, Map<Id, AppearanceImage | null>>();

/** The image a component's shapes show, from its own appearance or the nearest it inherits. */
export function componentImage(
  definitions: Definitions,
  componentId: Id,
): AppearanceImage | undefined {
  let byComponent = componentImages.get(definitions);
  if (!byComponent) {
    byComponent = new Map();
    componentImages.set(definitions, byComponent);
  }
  let image = byComponent.get(componentId);
  if (image === undefined) {
    const lineage = definitions.component(componentId)?.lineage ?? [];
    image =
      resolveImage(lineage.map((id) => definitions.components.get(id)?.definition.appearance)) ??
      null;
    byComponent.set(componentId, image);
  }
  return image ?? undefined;
}

/**
 * The image an element's shapes show: its own appearance's, otherwise its component's. To draw it,
 * look its id up with {@link ImageCatalog.shown}.
 */
export function imageShownBy(
  element: { component: Id; appearance?: Appearance },
  definitions: Definitions,
): AppearanceImage | undefined {
  const own = element.appearance?.image;
  if (own === 'none') return undefined;
  return own ?? componentImage(definitions, element.component);
}

/** The id of the image an appearance names, if it names one. */
export function imageIdOf(appearance: Appearance | undefined): Id | undefined {
  const image = appearance?.image;
  return image === undefined || image === 'none' ? undefined : image.image;
}

/** What names an image in its appearance: components of any package, and elements, World included. */
export function imageUsers(state: ProjectSnapshot, imageId: Id): Id[] {
  const users: Id[] = [];
  for (const file of state.packages) {
    for (const component of file.components) {
      if (imageIdOf(component.appearance) === imageId) users.push(component.id);
    }
  }
  for (const element of elementsOf(state)) {
    if (imageIdOf(element.appearance) === imageId) users.push(element.id);
  }
  return users;
}

/** World and every other element. */
export function elementsOf(state: ProjectSnapshot): Element[] {
  return [state.model.world, ...state.model.elements];
}

/**
 * An image of a package whose content is equal to what cleaning gives for `image`, so that adding
 * the same picture again reuses its id.
 */
export function imageWithContent(
  state: ProjectSnapshot,
  packageId: Id,
  content: { svg: string } | { format: string; data: string },
): Defined<ImageDefinition> | undefined {
  const file = state.packages.find((each) => each.id === packageId);
  for (const image of file?.images ?? []) {
    const cleaned = imagesIn(state).shown(image.id);
    if (!cleaned) continue;
    if (
      'svg' in content
        ? cleaned.kind === 'svg' && cleaned.svg === content.svg
        : cleaned.kind === 'bitmap' &&
          cleaned.format === content.format &&
          cleaned.data === content.data
    ) {
      return { definition: image, package: packageId };
    }
  }
  return undefined;
}
