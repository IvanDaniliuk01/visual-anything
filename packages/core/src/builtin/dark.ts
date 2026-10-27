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
    // Machine learning (P1 W62).
    'machine-learning.dataset': { fill: '#13262D', stroke: '#63B6D2' },
    'machine-learning.tensor': { fill: '#13172D', stroke: '#9EA7E3' },
    'machine-learning.layer': { fill: '#161F29', stroke: '#98ADC8' },
    'machine-learning.dense-layer': { fill: '#13202D', stroke: '#82AFDB' },
    'machine-learning.convolution-layer': { fill: '#132D29', stroke: '#38C2AF' },
    'machine-learning.attention-layer': { fill: '#2D1F13', stroke: '#D6A071' },
    'machine-learning.embedding-layer': { fill: '#28132D', stroke: '#D096DC' },
    'machine-learning.normalization-layer': { fill: '#2D2813', stroke: '#C8AD41' },
    'machine-learning.recurrent-layer': { fill: '#172D13', stroke: '#5DC44D' },
    'machine-learning.pooling-layer': { fill: '#282D13', stroke: '#A1BC37' },
    'machine-learning.block': { fill: '#1A1B26', stroke: '#A8AAC2' },
    'machine-learning.loss': { fill: '#2D1513', stroke: '#E09994' },
    'machine-learning.optimizer': { fill: '#132D1F', stroke: '#39C67B' },
    'machine-learning.metric': { fill: '#1C132D', stroke: '#B9A0E3' },
    'machine-learning.training-run': { fill: '#1A2226', stroke: '#97AEBA' },
    // Physical AI and robotics (P1).
    'physical-ai.robot': { fill: '#1C2026', stroke: '#A5B0BC' },
    'physical-ai.link': { fill: '#172536', stroke: '#8DB8F2' },
    'physical-ai.joint': { fill: '#2E2414', stroke: '#E2B45E' },
    'physical-ai.sensor': { fill: '#132A26', stroke: '#5FC6B0' },
    'physical-ai.actuator': { fill: '#321C16', stroke: '#F29A7A' },
    'physical-ai.controller': { fill: '#241F38', stroke: '#B7A0F2' },
    'physical-ai.policy': { fill: '#2E1C25', stroke: '#EE93B8' },
    'physical-ai.compute-unit': { fill: '#1C2129', stroke: '#A9B4C2' },
    'physical-ai.node': { fill: '#172B45', stroke: '#78A8EE' },
    'physical-ai.topic': { fill: '#1F2A12', stroke: '#A9D16A' },
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
    // Machine learning (P1 W62).
    'machine-learning.flows-into': { stroke: '#AEB8C4' },
    'machine-learning.trains-on': { stroke: '#63B6D2' },
    'machine-learning.is-measured-by': { stroke: '#B9A0E3' },
    'machine-learning.minimizes': { stroke: '#E09994' },
    'machine-learning.updates': { stroke: '#39C67B' },
    // Physical AI and robotics (P1).
    'physical-ai.is-attached-to': { stroke: '#AEB8C4' },
    'physical-ai.drives': { stroke: '#F29A7A' },
    'physical-ai.senses': { stroke: '#5FC6B0' },
    'physical-ai.commands': { stroke: '#B7A0F2' },
    'physical-ai.publishes-to': { stroke: '#8DB8F2' },
    'physical-ai.subscribes-to': { stroke: '#8DB8F2' },
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
