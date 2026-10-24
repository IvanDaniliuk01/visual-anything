/**
 * The shade each color built into Visual Anything takes in the dark theme: those of Essence, "relates
 * to" and the built-in packages, by the id of the definition that sets it (ADR-0033). The light theme
 * draws the colors the definitions give. A color trait takes its shade only while nothing in the
 * project sets it; the project's own colors are drawn as stored in both themes.
 *
 * Every dark stroke reads at 6:1 or more on the dark canvas and on its own dark fill, and every dark
 * fill sits close to the canvas, so that shapes are told apart by their strokes, as in the light theme.
 */
import type { Color, Id } from '@visual-anything/schema';

/** The dark shades of a definition's colors: only of those it sets itself. */
export interface DarkShades {
  components: Readonly<Record<Id, Readonly<{ fill?: Color; stroke?: Color }>>>;
  relationTypes: Readonly<Record<Id, Readonly<{ stroke?: Color }>>>;
}

export const DARK_SHADES: DarkShades = Object.freeze({
  components: Object.freeze({
    essence: { fill: '#1E2329', stroke: '#9AA5B1' },
    'systems.box': { fill: '#1E2329', stroke: '#9AA5B1' },
    'systems.system': { fill: '#1C2027', stroke: '#8F9AA6' },
    'systems.service': { fill: '#172B45', stroke: '#78A8EE' },
    'systems.chat-channel': { fill: '#16332A', stroke: '#68C495' },
    'systems.ai-agent': { fill: '#2A2247', stroke: '#B39CF0' },
    'systems.mcp-server': { fill: '#123331', stroke: '#59C2B5' },
    'systems.semantic-layer': { fill: '#381E2B', stroke: '#EC8FB3' },
    'systems.database': { fill: '#352C12', stroke: '#DDB955' },
    'systems.object-storage': { fill: '#1F2547', stroke: '#9DA8EE' },
    'systems.person': { fill: '#3A2817', stroke: '#E9A35C' },
    'data-modeling.table': { fill: '#1A2A40', stroke: '#7CA6E8' },
    'data-modeling.column': { fill: '#1E2329', stroke: '#7CA6E8' },
  }),
  relationTypes: Object.freeze({
    'relates-to': { stroke: '#8F9AA6' },
    'systems.communicates-with': { stroke: '#AEB8C4' },
    'systems.reads-from': { stroke: '#AEB8C4' },
    'systems.writes-to': { stroke: '#AEB8C4' },
    'data-modeling.references': { stroke: '#7CA6E8' },
  }),
});

/**
 * The dark shade of a color a built-in definition sets itself, if it has one. Looked up by own key
 * only, since ids such as `constructor` are valid ids.
 */
export function darkShadeOf(
  kind: 'component' | 'relation-type',
  id: Id,
  trait: 'fill' | 'stroke',
): Color | undefined {
  const shades = kind === 'component' ? DARK_SHADES.components : DARK_SHADES.relationTypes;
  if (!Object.hasOwn(shades, id)) return undefined;
  const shade = shades[id] as Readonly<{ fill?: Color; stroke?: Color }>;
  return Object.hasOwn(shade, trait) ? shade[trait] : undefined;
}
