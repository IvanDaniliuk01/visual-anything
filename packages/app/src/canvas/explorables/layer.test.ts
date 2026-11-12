/**
 * The explorable layer (ADR 0107, A10.3), with a fake image store and provider: each spot draws its
 * card from its face until it has a still, a still's texture is made by the store and stretched over
 * its spot, the card's text hides under it, stills are asked for only near the screen, and a frame
 * where nothing changed asks the store nothing.
 */
import { Sprite, Text, Texture, type Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { ImageStore, ReadyPictureRequest } from '../images';
import type { Scene } from '../scene';
import {
  ExplorableLayer,
  type ExplorableProvider,
  type StillPicture,
  type StillSpot,
} from './layer';
import type { ExplorableFace } from './card';

const SCENE = {
  shapes: [],
  relations: [],
  notes: [],
  arrows: [],
  bounds: undefined,
  pictures: [
    {
      id: 'graph',
      rect: { x: 0, y: 0, width: 320, height: 240 },
      name: 'Graph',
      named: true,
      explorable: { id: 'p.graph', element: 'f' },
    },
    {
      id: 'far',
      rect: { x: 5000, y: 5000, width: 320, height: 240 },
      name: 'Far',
      named: true,
      explorable: { id: 'p.graph' },
    },
    { id: 'photo', rect: { x: 0, y: 300, width: 10, height: 10 }, name: 'Photo', named: false },
  ],
} as unknown as Scene;

const NOTHING = { shapes: new Set<string>(), free: new Set<string>() };
const VIEW = {
  scale: 1,
  shown: { x: 0, y: 0, width: 800, height: 600 },
  resolution: 2,
  settled: true,
};

class FakeStore {
  asked: ReadyPictureRequest<unknown>[] = [];
  made = new Set<number>();
  used: string[] = [];
  readyTexture(request: ReadyPictureRequest<unknown>) {
    this.asked.push(request);
    if (!this.made.has(request.serial)) {
      this.made.add(request.serial);
      return undefined;
    }
    return { texture: Texture.WHITE, key: `${request.serial}:r`, bucket: 512, exact: true };
  }
  use(_tile: string, keys: Iterable<string>) {
    this.used = [...keys];
  }
}

class FakeProvider implements ExplorableProvider {
  faces = new Map<string, ExplorableFace>([
    ['p.graph', { name: 'Graph', libraries: [], why: 'Double-click to explore.', runs: true }],
  ]);
  stills = new Map<string, StillPicture>();
  asked: StillSpot[] = [];
  face(id: string) {
    return this.faces.get(id);
  }
  still(spot: Readonly<StillSpot>) {
    this.asked.push({ ...spot });
    return this.stills.get(spot.spot);
  }
  flush() {}
}

const texts = (node: Container | undefined): string[] =>
  (node?.children ?? []).flatMap((child) => (child instanceof Text ? [child.text] : texts(child)));

function harness() {
  const store = new FakeStore();
  const provider = new FakeProvider();
  const layer = new ExplorableLayer(
    () => store as unknown as ImageStore<Texture, unknown>,
    () => {},
  );
  layer.setProvider(provider);
  layer.setScene(SCENE, NOTHING, NOTHING);
  return { store, provider, layer };
}

describe('the explorable layer', () => {
  it('draws a card for each loose explorable, from its face, and none for a picture', () => {
    const { layer } = harness();
    expect(layer.spots).toEqual(['graph', 'far']);
    expect(texts(layer.container)).toContain('Graph');
    expect(texts(layer.container)).toContain('Double-click to explore.');
  });

  it('asks only for the spots near the screen, at the bucket they show at', () => {
    const { layer, provider } = harness();
    layer.frame(VIEW);
    expect(provider.asked.map((each) => each.spot)).toEqual(['graph']);
    expect(provider.asked[0]).toMatchObject({
      explorable: 'p.graph',
      element: 'f',
      width: 320,
      height: 240,
      // 320 units at a resolution of 2 are 640 pixels: the 1,024 bucket.
      bucket: 1024,
    });
  });

  it('shows a still once the store made its texture, over the card, and asks nothing more', () => {
    const { layer, provider, store } = harness();
    provider.stills.set('graph', { key: 'k1', picture: {}, width: 1024, height: 768 });
    expect(layer.frame(VIEW)).toBe(true);
    expect(layer.showsStill('graph')).toBe(false);
    expect(layer.frame(VIEW)).toBe(false);
    expect(layer.showsStill('graph')).toBe(true);
    const sprite = layer.container.children[0]?.children.find((each) => each instanceof Sprite);
    expect(sprite).toMatchObject({ x: 0, y: 0, width: 320, height: 240 });
    const asked = store.asked.length;
    layer.frame(VIEW);
    expect(store.asked.length).toBe(asked);
    expect(store.used).toHaveLength(1);
    // Its card goes back once it has no still, as when its approval is withdrawn.
    provider.stills.clear();
    layer.frame(VIEW);
    expect(layer.showsStill('graph')).toBe(false);
  });

  it('leaves out what the emphasis hides, and moves the dragged ones', () => {
    const { layer } = harness();
    layer.setScene(SCENE, { shapes: new Set(), free: new Set(['far']) }, NOTHING);
    expect(layer.spots).toEqual(['graph']);
    layer.setDrag(new Set(['graph']), { x: 10, y: 5 });
    expect(layer.container.children[0]?.position).toMatchObject({ x: 10, y: 5 });
  });
});
