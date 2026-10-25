/**
 * Checking a project's images as read from its files. Opening never rewrites a file, so an image that
 * cleaning would change only warns, and readers see its cleaned view; one that cleaning refuses warns
 * and is absent everywhere.
 */
import type { ImageDefinition } from '@visual-anything/schema';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { decodeBase64 } from './base64';
import { readBitmap } from './bitmap';
import { IMAGE_CAPS, elementsOf, imageIdOf, imagesIn } from './catalog';
import { cleanedImage, imageText, isClean } from './cleaned';
import type { Cleaned } from './result';
import { cleanSvg } from './svg';

/** What is wrong with a project's images: errors keep it from opening, warnings do not. */
export function checkImages(state: ProjectSnapshot): { errors: Problem[]; warnings: Problem[] } {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];
  const catalog = imagesIn(state);
  for (const each of catalog.problems) {
    (each.code === 'defined-twice' ? errors : warnings).push(each);
  }

  for (const { definition: image, package: packageId } of catalog.images.values()) {
    const subjects = [image.id, packageId];
    if (!cleanedImage(image)) {
      const refused = cleaning(image);
      const reason = refused.ok ? '' : ` ${refused.problem.message}`;
      warnings.push(
        problem(
          'invalid-image',
          `The image "${image.name}" (${image.id}) is not drawn: cleaning refuses it.${reason}`,
          subjects,
        ),
      );
    } else if (!isClean(image)) {
      const result = cleaning(image);
      const removed =
        result.ok && result.removed.length > 0 ? `: ${result.removed.join(', ')}` : '';
      warnings.push(
        problem(
          'image-not-clean',
          `The image "${image.name}" (${image.id}) holds what cleaning removes${removed}. It is shown cleaned; clean it to store it so.`,
          subjects,
        ),
      );
    }
  }

  for (const file of state.packages) {
    const total = (file.images ?? []).reduce((sum, image) => sum + imageText(image).length, 0);
    if (total < IMAGE_CAPS.packageWarning) continue;
    const past = (file.images ?? []).filter((image) => catalog.pastTotal.has(image.id));
    const size = `${(total / (1024 * 1024)).toFixed(1)} MiB`;
    warnings.push(
      problem(
        'large-images',
        past.length === 0
          ? `The images of the package "${file.name}" hold ${size}; keep them under 2 MiB, past which they are not drawn.`
          : `The images of the package "${file.name}" hold ${size}, over 2 MiB; these are not drawn: ${past.map((image) => `"${image.name}"`).join(', ')}.`,
        [file.id, ...past.map((image) => image.id)],
      ),
    );
  }

  const unknown = (id: string, owner: string, what: string) =>
    problem(
      'unknown-image',
      `${what} shows the image "${id}", which no package in use defines; it shows none.`,
      [owner],
    );
  for (const file of state.packages) {
    for (const component of file.components) {
      const id = imageIdOf(component.appearance);
      if (id !== undefined && !catalog.image(id)) {
        warnings.push(unknown(id, component.id, `The component "${component.name}"`));
      }
    }
  }
  for (const [owner, appearance] of Object.entries(state.project.appearances?.components ?? {})) {
    const id = imageIdOf(appearance);
    if (id !== undefined && !catalog.image(id)) {
      warnings.push(unknown(id, owner, `The project appearance of "${owner}"`));
    }
  }
  for (const element of elementsOf(state)) {
    const id = imageIdOf(element.appearance);
    if (id !== undefined && !catalog.image(id)) {
      warnings.push(unknown(id, element.id, `The element "${element.name}"`));
    }
  }
  return { errors, warnings };
}

/** Cleans a stored image again, to say what cleaning removes from it or why it refuses it. */
function cleaning(image: ImageDefinition): Cleaned<unknown> {
  if (image.kind === 'svg') return cleanSvg(image.svg);
  const bytes = decodeBase64(image.data);
  if (bytes === undefined) {
    return { ok: false, problem: problem('invalid-image', 'Its data is not base64.') };
  }
  return readBitmap(bytes, image.format);
}
