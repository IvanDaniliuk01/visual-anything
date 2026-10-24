/** A project with images, for the image tests. */
import type { BitmapImage, ImageDefinition, PackageFile, SvgImage } from '@visual-anything/schema';
import type { ProjectSnapshot } from '../../snapshot';
import { encodeBase64 } from '../base64';
import { png } from './bitmaps';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

export const LOGO: SvgImage = {
  kind: 'svg',
  id: 'clinic.logo-k3f9q2',
  name: 'Logo',
  source: 'Simple Icons, CC0-1.0',
  width: 24,
  height: 24,
  svg: `<svg viewBox="0 0 24 24" ${NS}><path d="M0 0h24v24H0z" fill="#25D366"/></svg>`,
};

export const DESK: BitmapImage = {
  kind: 'bitmap',
  id: 'clinic.desk-4fj2ka',
  name: 'Front desk',
  format: 'png',
  width: 4,
  height: 3,
  data: encodeBase64(png()),
};

/** An SVG of a given text, as one of the clinic's images. */
export function svgImage(id: string, svg: string, name = id): SvgImage {
  return { kind: 'svg', id, name, width: 10, height: 10, svg };
}

export function clinicPackage(images: ImageDefinition[] = [LOGO, DESK]): PackageFile {
  return {
    id: 'clinic',
    name: 'Clinic',
    components: [
      {
        id: 'clinic.calendar',
        name: 'Calendar',
        derivesFrom: 'essence',
        appearance: { image: { image: LOGO.id, placement: 'icon' } },
      },
      { id: 'clinic.agenda', name: 'Agenda', derivesFrom: 'clinic.calendar' },
      {
        id: 'clinic.plain',
        name: 'Plain',
        derivesFrom: 'clinic.calendar',
        appearance: { image: 'none' },
      },
    ],
    relationTypes: [],
    ...(images.length > 0 ? { images } : {}),
  };
}

/** A project whose own package "clinic" has images, components that show them and elements. */
export function imageProject(images?: ImageDefinition[]): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Clinic', packages: ['clinic', 'other'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'booking', component: 'clinic.agenda', name: 'Booking' },
        {
          id: 'desk',
          component: 'clinic.plain',
          name: 'Desk',
          appearance: { image: { image: DESK.id, placement: 'drawing' } },
        },
        { id: 'plain', component: 'clinic.plain', name: 'Plain' },
      ],
      relations: [],
    },
    packages: [
      clinicPackage(images),
      {
        id: 'other',
        name: 'Other',
        components: [{ id: 'other.box', name: 'Box', derivesFrom: 'essence' }],
        relationTypes: [],
      },
    ],
    views: [],
    scenarios: [],
  };
}
