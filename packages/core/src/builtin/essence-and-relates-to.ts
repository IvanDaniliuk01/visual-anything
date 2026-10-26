/**
 * Essence and "relates to": the component and the relation type every other one ultimately derives
 * from. They are built into Visual Anything and belong to no package, so they give the defaults that
 * everything inherits when nothing nearer defines a trait.
 */
import type { RelationAppearance, RelationType } from '@visual-anything/schema';
import { ESSENCE_ID, RELATES_TO_ID } from '@visual-anything/schema';
import type { ResolvedAppearance } from '../appearance';

/**
 * Essence, with every trait it gives to the components that derive from it: a plain rectangle that
 * writes its component's name, with no badges, no connection points and no rows.
 */
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
    detail: { componentName: true, attributes: [], badges: [] },
    contentsAsRows: false,
    connectionPoints: [],
  } satisfies ResolvedAppearance as ResolvedAppearance,
} as const;

/** "Relates to", with every trait it gives to the relation types that derive from it. */
export const RELATES_TO = {
  id: RELATES_TO_ID,
  name: 'relates to',
  description: 'The relation type every other relation type ultimately derives from.',
  direction: 'undirected' satisfies NonNullable<RelationType['direction']>,
  nests: false,
  // It sets no route's style, which its relations then take from the view (ADR 0069).
  appearance: { stroke: '#52606D', width: 2, dash: 'solid' } satisfies Required<
    Omit<RelationAppearance, 'route'>
  >,
} as const;
