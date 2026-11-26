/** A sample whose relations send travelers along their lines (ADR 0110), for the tests. */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { ImageDefinition, Traveler } from '@visual-anything/schema';
import { loadSample } from './sample';

/** The picture the travelers draw: a blue box twice as wide as high. */
export const TRUCK: ImageDefinition = {
  kind: 'svg',
  id: 'clinic.truck',
  name: 'Truck',
  width: 40,
  height: 20,
  svg: '<svg viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="20" fill="#3e63dd"/></svg>',
};

/** The view of the sample the tests draw. */
export const TRAVELERS_VIEW = 'system-overview';

/** The sample with the truck among the clinic package's images, every relation sending `traveler`. */
export function withTravelers(
  traveler: Traveler = { image: 'clinic.truck' },
  base: ProjectSnapshot = loadSample(),
): ProjectSnapshot {
  return {
    ...base,
    packages: base.packages.map((file) =>
      file.id === 'clinic' ? { ...file, images: [...(file.images ?? []), TRUCK] } : file,
    ),
    model: {
      ...base.model,
      relations: base.model.relations.map((relation) => ({
        ...relation,
        appearance: { ...relation.appearance, traveler },
      })),
    },
  };
}
