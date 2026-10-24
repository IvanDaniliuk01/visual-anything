import { describe, expect, it } from 'vitest';
import type { PackageFile } from './files';
import { formatFile } from './format';
import { validateFile } from './validate';

const SVG = {
  kind: 'svg',
  id: 'clinic.whatsapp-logo-k3f9q2',
  name: 'WhatsApp logo',
  source: 'Simple Icons, CC0-1.0',
  width: 24,
  height: 24,
  svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z" fill="#25D366"/></svg>',
} as const;

const BITMAP = {
  kind: 'bitmap',
  id: 'clinic.front-desk-4fj2ka',
  name: 'Front desk',
  format: 'png',
  width: 1,
  height: 1,
  data: 'iVBORw0KGgo=',
} as const;

function clinic(extra: Partial<PackageFile> = {}): PackageFile {
  return {
    id: 'clinic',
    name: 'Clinic',
    components: [
      {
        id: 'clinic.calendar',
        name: 'Calendar',
        derivesFrom: 'essence',
        appearance: { image: { image: SVG.id, placement: 'icon' } },
      },
    ],
    relationTypes: [],
    ...extra,
  };
}

describe('package images in the schema', () => {
  it('accepts SVG and bitmap images, and appearances that show one or none', () => {
    const file = clinic({ images: [SVG, BITMAP] });
    expect(validateFile('package', file)).toEqual({ ok: true, value: file });
    const none = clinic({
      components: [
        { id: 'clinic.x', name: 'X', derivesFrom: 'essence', appearance: { image: 'none' } },
      ],
    });
    expect(validateFile('package', none).ok).toBe(true);
    const tinted = clinic({
      components: [
        {
          id: 'clinic.x',
          name: 'X',
          derivesFrom: 'essence',
          appearance: { image: { image: SVG.id, placement: 'drawing', tint: '#112233' } },
        },
      ],
    });
    expect(validateFile('package', tinted).ok).toBe(true);
  });

  it('refuses an empty list of images: a package without images leaves the key out', () => {
    expect(validateFile('package', clinic({ images: [] })).ok).toBe(false);
  });

  it('refuses SVG text that does not start with an svg element, and keys outside the allow-list', () => {
    expect(validateFile('package', clinic({ images: [{ ...SVG, svg: '<?xml?><svg/>' }] })).ok).toBe(
      false,
    );
    const withScript = { ...SVG, script: 'alert(1)' };
    expect(validateFile('package', { ...clinic(), images: [withScript] }).ok).toBe(false);
  });

  it('refuses bitmaps over 1,024 pixels a side, of other formats or with data that is not base64', () => {
    expect(validateFile('package', clinic({ images: [{ ...BITMAP, width: 1025 }] })).ok).toBe(
      false,
    );
    const gif = { ...BITMAP, format: 'gif' };
    expect(validateFile('package', { ...clinic(), images: [gif] }).ok).toBe(false);
    expect(validateFile('package', clinic({ images: [{ ...BITMAP, data: 'a:b/' }] })).ok).toBe(
      false,
    );
  });

  it('refuses an image without its kind with one error about the kind', () => {
    const withoutKind: Record<string, unknown> = { ...SVG };
    delete withoutKind.kind;
    const result = validateFile('package', { ...clinic(), images: [withoutKind] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toBe('/images/0');
  });

  it('refuses an appearance image with an unknown placement or a tint that is not a colour', () => {
    const shown = (image: unknown) =>
      validateFile('package', {
        ...clinic(),
        components: [{ id: 'clinic.x', name: 'X', derivesFrom: 'essence', appearance: { image } }],
      }).ok;
    expect(shown({ image: SVG.id, placement: 'background' })).toBe(false);
    expect(shown({ image: SVG.id, tint: 'red' })).toBe(false);
    expect(shown('nothing')).toBe(false);
  });

  it('writes images after the definitions, each key in its declared order', () => {
    const shuffled = {
      images: [
        { svg: SVG.svg, height: 24, width: 24, name: SVG.name, id: SVG.id, kind: 'svg' as const },
        {
          data: BITMAP.data,
          height: 1,
          width: 1,
          format: 'png' as const,
          name: 'B',
          id: BITMAP.id,
          kind: 'bitmap' as const,
        },
      ],
      relationTypes: [],
      components: [],
      name: 'Clinic',
      id: 'clinic',
    } satisfies PackageFile;
    const text = formatFile('package', shuffled);
    expect(text).toBe(
      [
        '{',
        '  "id": "clinic",',
        '  "name": "Clinic",',
        '  "components": [],',
        '  "relationTypes": [],',
        '  "images": [',
        '    {',
        '      "kind": "svg",',
        `      "id": "${SVG.id}",`,
        `      "name": "${SVG.name}",`,
        '      "width": 24,',
        '      "height": 24,',
        `      "svg": ${JSON.stringify(SVG.svg)}`,
        '    },',
        '    {',
        '      "kind": "bitmap",',
        `      "id": "${BITMAP.id}",`,
        '      "name": "B",',
        '      "format": "png",',
        '      "width": 1,',
        '      "height": 1,',
        `      "data": "${BITMAP.data}"`,
        '    }',
        '  ]',
        '}',
        '',
      ].join('\n'),
    );
  });
});
