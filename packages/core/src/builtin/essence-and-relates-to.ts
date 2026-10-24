/**
 * Essence and "relates to": the component and the relation type every other one ultimately derives
 * from. They are built into Visual Anything and belong to no package, so they give the defaults that
 * everything inherits when nothing nearer defines a trait.
 */
import type { Appearance, RelationAppearance, RelationType } from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';

/** Essence, with every trait it gives to the components that derive from it. */
export const ESSENCE = {
  id: ESSENCE_ID,
  name: 'Essence',
  description: 'The component every other component ultimately derives from.',
  appearance: {
    shape: 'rectangle',
    fill: '#FFFFFF',
    stroke: '#52606D',
    width: 160,
    height: 72,
    // Essence shows no image.
  } satisfies Required<Omit<Appearance, 'image'>>,
} as const;

/** "Relates to", with every trait it gives to the relation types that derive from it. */
export const RELATES_TO = {
  id: RELATES_TO_ID,
  name: 'relates to',
  description: 'The relation type every other relation type ultimately derives from.',
  direction: 'undirected' satisfies NonNullable<RelationType['direction']>,
  nests: false,
  appearance: { stroke: '#52606D', width: 2, dash: 'solid' } satisfies Required<RelationAppearance>,
} as const;
