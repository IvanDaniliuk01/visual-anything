import { crc32, deflateSync } from 'node:zlib';
import { imagesIn } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from './tool-harness';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const SQUARE = `<svg viewBox="0 0 10 10" ${NS}><path d="M0 0h10v10z"/></svg>`;
const CIRCLE = `<svg viewBox="0 0 20 20" ${NS}><circle cx="10" cy="10" r="9"/></svg>`;
const SCRIPTED = `<svg viewBox="0 0 10 10" ${NS}><script>fetch('https://example.com')</script><path d="M0 0h10v10z" onclick="alert(1)"/></svg>`;

/** A PNG of RGBA pixels in base64, with chunks of text after its header when asked. */
function png(width = 2, height = 2, text?: string): string {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...(text === undefined ? [] : [chunk('tEXt', Buffer.from(`Comment\0${text}`, 'latin1'))]),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const image = (id: string) => imagesIn(tools.session.snapshot).image(id)?.definition;

describe('add_image', () => {
  it('adds SVG text to one of the project’s packages as one action of Claude’s', async () => {
    const added = await tools.value('add_image', {
      package: 'shop',
      name: 'Cart icon',
      id: 'shop.cart-icon',
      svg: SQUARE,
      source: 'Drawn by Claude',
    });
    expect(added).toMatchObject({
      done: 'Add the image "Cart icon"',
      undo: 'The person can undo it in the app.',
      image: 'shop.cart-icon',
      width: 10,
      height: 10,
      cleaned: 'Cleaning removed nothing: the picture is stored as given.',
    });
    expect(added.show).toContain('"image": "shop.cart-icon"');
    expect(image('shop.cart-icon')).toMatchObject({ kind: 'svg', source: 'Drawn by Claude' });
    expect(tools.session.history.undo).toEqual({
      label: 'Add the image "Cart icon"',
      author: 'claude',
    });
  });

  it('says what cleaning removed, and stores only what cleaning gives', async () => {
    const added = await tools.value('add_image', {
      package: 'shop',
      id: 'shop.bell',
      name: 'Bell',
      svg: SCRIPTED,
    });
    expect(added.cleaned).toBe(
      'Cleaning the image "Bell" removed: 1 script element, 1 event handler attribute.',
    );
    expect(added.warnings).toBeUndefined();
    const stored = image('shop.bell');
    expect(stored?.kind === 'svg' ? stored.svg : '').not.toMatch(/script|onclick|example/);
  });

  it('adds a bitmap from base64 or a data URL, dropping its text', async () => {
    const added = await tools.value('add_image', {
      package: 'shop',
      id: 'shop.photo',
      name: 'Photo',
      format: 'png',
      data: png(2, 2, 'Taken at 40.4168 N, 3.7038 W'),
    });
    expect(added).toMatchObject({ image: 'shop.photo', width: 2, height: 2 });
    expect(added.cleaned).toMatch(/^Cleaning the image "Photo" removed: /);
    const dataUrl = await tools.value('add_image', {
      package: 'shop',
      name: 'Wide',
      data: `data:image/png;base64,${png(4, 1)}`,
    });
    expect(dataUrl).toMatchObject({ width: 4, height: 1 });
    expect(image(dataUrl.image as string)).toMatchObject({ kind: 'bitmap', format: 'png' });
  });

  it('gives back the image a package already holds for the same picture', async () => {
    await tools.value('add_image', {
      package: 'shop',
      id: 'shop.square',
      name: 'Square',
      svg: SQUARE,
    });
    const again = await tools.value('add_image', { package: 'shop', name: 'Again', svg: SQUARE });
    expect(again).toMatchObject({
      done: 'Nothing changed, so nothing was recorded.',
      image: 'shop.square',
    });
    expect(imagesIn(tools.session.snapshot).images.size).toBe(1);
  });

  it.each([
    ['an address', { svg: 'https://example.com/logo.svg' }, /never fetches anything/],
    ['a path', { svg: 'C:/pictures/logo.svg' }, /never fetches anything/],
    ['an address as data', { format: 'png', data: 'https://example.com/a.png' }, /never fetches/],
    ['no picture', {}, /Give the picture/],
    ['two pictures', { svg: SQUARE, format: 'png', data: png() }, /Give the picture once/],
    ['a bitmap without its format', { data: png() }, /Give the bitmap’s format/],
    [
      'a data URL of another format',
      { format: 'jpeg', data: `data:image/png;base64,${png()}` },
      /is a PNG picture, not a JPEG/,
    ],
  ])('refuses %s, and fetches nothing', async (_case, picture, message) => {
    expect(await tools.failure('add_image', { package: 'shop', name: 'Logo', ...picture })).toMatch(
      message,
    );
    expect(imagesIn(tools.session.snapshot).images.size).toBe(0);
  });

  it('refuses a built-in package, a package the project does not use, and what the core refuses', async () => {
    expect(
      await tools.failure('add_image', { package: 'systems', name: 'Logo', svg: SQUARE }),
    ).toMatch(/"systems" is a built-in package/);
    expect(
      await tools.failure('add_image', { package: 'nowhere', name: 'Logo', svg: SQUARE }),
    ).toMatch(/uses no package "nowhere"/);
    expect(
      await tools.failure('add_image', {
        package: 'shop',
        name: 'Doctype',
        svg: `<!DOCTYPE svg><svg ${NS}/>`,
      }),
    ).toMatch(/^Refused, so nothing changed: The image "Doctype" is refused: .*\(invalid-image\)$/);
    expect(
      await tools.failure('add_image', {
        package: 'shop',
        name: 'Bad',
        format: 'png',
        data: 'abc',
      }),
    ).toMatch(/\(invalid-image\)$/);
  });
});

describe('replace_image', () => {
  beforeEach(async () => {
    await tools.value('add_image', { package: 'shop', id: 'shop.logo', name: 'Logo', svg: SQUARE });
    await tools.value('update_element', {
      id: 'cart',
      appearanceTraits: { image: { image: 'shop.logo', placement: 'icon' } },
    });
  });

  it('replaces the picture every shape that shows it shows, as one action', async () => {
    const replaced = await tools.value('replace_image', { id: 'shop.logo', svg: CIRCLE });
    expect(replaced).toMatchObject({
      done: 'Replace the image "Logo"',
      image: 'shop.logo',
      width: 20,
      height: 20,
      cleaned: 'Cleaning removed nothing: the picture is stored as given.',
      shownBy: ['Cart'],
    });
    expect(image('shop.logo')).toMatchObject({ name: 'Logo', width: 20 });
  });

  it('renames an image and keeps its picture', async () => {
    const renamed = await tools.value('replace_image', { id: 'shop.logo', name: 'Shop logo' });
    expect(renamed).toMatchObject({ done: 'Replace the image "Shop logo"' });
    expect(renamed.cleaned).toBeUndefined();
    expect(image('shop.logo')).toMatchObject({ name: 'Shop logo', width: 10 });
  });

  it('refuses an image no package defines, and a call that changes nothing', async () => {
    expect(await tools.failure('replace_image', { id: 'shop.none', svg: CIRCLE })).toMatch(
      /No package in use defines the image "shop.none"/,
    );
    expect(await tools.failure('replace_image', { id: 'shop.logo' })).toMatch(
      /Give something to change/,
    );
    expect(
      await tools.failure('replace_image', { id: 'shop.logo', svg: 'http://example.com/a.svg' }),
    ).toMatch(/never fetches/);
  });
});

describe('remove_image', () => {
  beforeEach(async () => {
    await tools.value('add_image', { package: 'shop', id: 'shop.logo', name: 'Logo', svg: SQUARE });
  });

  it('refuses while a shape shows it, naming what does, then removes it', async () => {
    await tools.value('update_element', {
      id: 'cart',
      appearanceTraits: { image: { image: 'shop.logo', placement: 'icon' } },
    });
    expect(await tools.failure('remove_image', { id: 'shop.logo' })).toMatch(
      /^Not removed: “Logo” is shown by 1 component or element: element "cart" \(Cart\)\. Make them show no image first/,
    );
    await tools.value('update_element', { id: 'cart', appearanceTraits: { image: null } });
    expect(await tools.value('remove_image', { id: 'shop.logo' })).toMatchObject({
      done: 'Remove the image "Logo"',
    });
    expect(image('shop.logo')).toBeUndefined();
  });

  it('refuses an image no package defines', async () => {
    expect(await tools.failure('remove_image', { id: 'shop.none' })).toMatch(
      /No package in use defines the image "shop.none"/,
    );
  });
});

describe('list_images', () => {
  it('lists the images with who shows them, and gives one SVG’s cleaned text', async () => {
    expect(await tools.value('list_images')).toEqual({ total: 0, images: [] });
    await tools.value('add_image', {
      package: 'shop',
      id: 'shop.logo',
      name: 'Logo',
      svg: SCRIPTED,
    });
    await tools.value('add_image', {
      package: 'shop',
      id: 'shop.photo',
      name: 'Photo',
      format: 'png',
      data: png(),
    });
    await tools.value('update_component', {
      id: 'shop.cart',
      appearance: { image: { image: 'shop.logo', placement: 'drawing' } },
    });
    const listed = await tools.value('list_images', { package: 'shop' });
    expect(listed).toEqual({
      total: 2,
      images: [
        {
          id: 'shop.logo',
          name: 'Logo',
          package: 'shop',
          builtIn: false,
          kind: 'svg',
          width: 10,
          height: 10,
          drawn: true,
          shownBy: [{ kind: 'component', id: 'shop.cart', name: 'Cart' }],
        },
        {
          id: 'shop.photo',
          name: 'Photo',
          package: 'shop',
          builtIn: false,
          kind: 'bitmap',
          format: 'png',
          width: 2,
          height: 2,
          drawn: true,
          shownBy: [],
        },
      ],
    });
    const one = await tools.value('list_images', { id: 'shop.logo' });
    const [logo] = one.images as { svg?: string }[];
    expect(logo?.svg).toMatch(/^<svg/);
    expect(logo?.svg).not.toMatch(/script/);
    expect(await tools.failure('list_images', { id: 'shop.none' })).toMatch(/shop\.none/);
  });

  it('changes nothing', async () => {
    const before = tools.session.snapshot;
    await tools.value('list_images');
    expect(tools.session.snapshot).toBe(before);
  });
});
