/**
 * The pictures of the benchmark's "images" variant (docs/designs/components.md §5.7): 20 distinct SVG
 * icons, 4 of them at the cleaner's caps on drawing cost, shown as icons beside the names of the
 * elements in systems; and 300 distinct bitmaps, shown as the drawings of 300 of those elements. They
 * are stored as the core cleans them, in packages of the project's own: the icons in one, the bitmaps
 * in three, since a package holds at most 128 images.
 */
import { cleanSvg, encodeBase64, readBitmap } from '@visual-anything/core';
import type { Element, ImageDefinition, PackageFile } from '@visual-anything/schema';
import { heavySvgIcons, png, svgIcon } from './pictures';

/** How many pictures of each kind the variant holds. */
export const SYNTHETIC_IMAGES = { icons: 20, heavyIcons: 4, photos: 300, perPackage: 100 } as const;

/** The side of each bitmap, in pixels. */
const PHOTO_SIDE = 48;

let packages: PackageFile[] | undefined;

/** The packages that hold the pictures, made once: they are the same every time. */
export function syntheticImagePackages(): PackageFile[] {
  packages ??= makePackages();
  return packages;
}

function makePackages(): PackageFile[] {
  const heavy = heavySvgIcons();
  const icons: ImageDefinition[] = [];
  for (let at = 0; at < SYNTHETIC_IMAGES.icons; at++) {
    const text = at < SYNTHETIC_IMAGES.heavyIcons ? (heavy[at] as string) : svgIcon(at);
    const cleaned = cleanSvg(text);
    if (!cleaned.ok)
      throw new Error(`Benchmark icon ${at} does not clean: ${cleaned.problem.message}`);
    icons.push({
      kind: 'svg',
      id: `bench-icons.icon-${at}`,
      name: at < SYNTHETIC_IMAGES.heavyIcons ? `Heavy icon ${at}` : `Icon ${at}`,
      ...cleaned.value,
    });
  }
  const files: PackageFile[] = [
    {
      id: 'bench-icons',
      name: 'Benchmark icons',
      components: [],
      relationTypes: [],
      images: icons,
    },
  ];
  for (let first = 0; first < SYNTHETIC_IMAGES.photos; first += SYNTHETIC_IMAGES.perPackage) {
    const id = `bench-photos-${first / SYNTHETIC_IMAGES.perPackage + 1}`;
    const images: ImageDefinition[] = [];
    for (let at = first; at < first + SYNTHETIC_IMAGES.perPackage; at++) {
      const cleaned = readBitmap(photo(at), 'png');
      if (!cleaned.ok) throw new Error(`Benchmark photo ${at} does not clean.`);
      images.push({
        kind: 'bitmap',
        id: `${id}.photo-${at}`,
        name: `Photo ${at}`,
        format: 'png',
        width: cleaned.value.width,
        height: cleaned.value.height,
        data: encodeBase64(cleaned.value.bytes),
      });
    }
    files.push({
      id,
      name: `Benchmark photos ${first / 100 + 1}`,
      components: [],
      relationTypes: [],
      images,
    });
  }
  return files;
}

/** A bitmap of its own: a gradient and a disc whose colours and place follow its number. */
function photo(seed: number): Uint8Array {
  const centre = { x: 10 + ((seed * 7) % 28), y: 10 + ((seed * 13) % 28) };
  return png(PHOTO_SIDE, PHOTO_SIDE, (x, y) => {
    const inDisc = (x - centre.x) ** 2 + (y - centre.y) ** 2 < 100;
    if (inDisc) return [255 - ((seed * 29) % 200), 240, (seed * 53) % 256];
    return [(x * 5 + seed * 13) % 256, (y * 5 + seed * 7) % 256, (seed * 31) % 256];
  });
}

/**
 * The elements with pictures: of the elements relations are drawn between, which sit in systems, 300
 * spread evenly show a bitmap as their drawing, and every other one an icon beside its name.
 */
export function withSyntheticImages(
  elements: readonly Element[],
  pictured: readonly string[],
): { elements: Element[]; packages: PackageFile[] } {
  const files = syntheticImagePackages();
  const photos = Math.min(SYNTHETIC_IMAGES.photos, pictured.length);
  const every = Math.max(1, Math.floor(pictured.length / Math.max(1, photos)));
  const shown = new Map<string, Element['appearance']>();
  let photo = 0;
  pictured.forEach((id, at) => {
    if (at % every === 0 && photo < photos) {
      const file = Math.floor(photo / SYNTHETIC_IMAGES.perPackage) + 1;
      shown.set(id, {
        image: { image: `bench-photos-${file}.photo-${photo}`, placement: 'drawing' },
      });
      photo += 1;
    } else {
      shown.set(id, { image: { image: `bench-icons.icon-${at % SYNTHETIC_IMAGES.icons}` } });
    }
  });
  return {
    elements: elements.map((element) => {
      const appearance = shown.get(element.id);
      return appearance ? { ...element, appearance } : element;
    }),
    packages: files,
  };
}
