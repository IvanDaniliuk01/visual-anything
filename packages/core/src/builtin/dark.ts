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
    'c4.person': { fill: '#172536', stroke: '#8DB8F2' },
    'c4.software-system': { fill: '#16263A', stroke: '#84B1EE' },
    'c4.container': { fill: '#18283B', stroke: '#8BB6EF' },
    'c4.component': { fill: '#1A283A', stroke: '#97BEF1' },
    'c4.deployment-node': { fill: '#1C2128', stroke: '#A3AFBC' },
    'data-science.source': { fill: '#152A20', stroke: '#6CC795' },
    'data-science.transform': { fill: '#2C2416', stroke: '#E2B45E' },
    'data-science.feature-store': { fill: '#241F38', stroke: '#B7A0F2' },
    'data-science.model': { fill: '#2E1C25', stroke: '#EE93B8' },
    'data-science.dashboard': { fill: '#13292A', stroke: '#5FC6B8' },
    // P1 W64: Processes and state machines.
    'process.pool': { fill: '#1C2128', stroke: '#A3AFBC' },
    'process.lane': { fill: '#1B1F25', stroke: '#9AA5B1' },
    'process.start-event': { fill: '#152A20', stroke: '#6CC795' },
    'process.end-event': { fill: '#33191A', stroke: '#F0928A' },
    'process.intermediate-event': { fill: '#2C2416', stroke: '#E2B45E' },
    'process.task': { fill: '#18283B', stroke: '#8BB6EF' },
    'process.subprocess': { fill: '#1A283A', stroke: '#97BEF1' },
    'process.exclusive-gateway': { fill: '#2E2812', stroke: '#DDB955' },
    'process.parallel-gateway': { fill: '#2E2812', stroke: '#DDB955' },
    'process.inclusive-gateway': { fill: '#2E2812', stroke: '#DDB955' },
    'process.data-object': { fill: '#241F38', stroke: '#B7A0F2' },
    'process.data-store': { fill: '#241F38', stroke: '#B7A0F2' },
    'process.state': { fill: '#13292A', stroke: '#5FC6B8' },
    'process.initial-state': { fill: '#1E2329', stroke: '#D3DAE2' },
    'process.final-state': { fill: '#1E2329', stroke: '#D3DAE2' },
    'process.choice': { fill: '#13292A', stroke: '#5FC6B8' },
  }),
  relationTypes: Object.freeze({
    'relates-to': { stroke: '#8F9AA6' },
    'systems.communicates-with': { stroke: '#AEB8C4' },
    'systems.reads-from': { stroke: '#AEB8C4' },
    'systems.writes-to': { stroke: '#AEB8C4' },
    'data-modeling.references': { stroke: '#7CA6E8' },
    'c4.uses': { stroke: '#AEB8C4' },
    'c4.delivers-to': { stroke: '#AEB8C4' },
    'data-science.feeds': { stroke: '#AEB8C4' },
    'data-science.trains': { stroke: '#B7A0F2' },
    // P1 W64: Processes and state machines.
    'process.sequence-flow': { stroke: '#AEB8C4' },
    'process.message-flow': { stroke: '#AEB8C4' },
    'process.association': { stroke: '#9AA5B1' },
    'process.transition': { stroke: '#AEB8C4' },
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
