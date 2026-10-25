/**
 * The icons of the starter packages (R38, ADR 0047): drawn for Visual Anything as plain shapes on a
 * 24-unit grid, each in one colour that reads on its component's fill in both themes, and stored as
 * the core's cleaner writes them, so that cleaning them again changes nothing. A test checks both.
 */
import type { SvgImage } from '@visual-anything/schema';
import { OWN_LICENSE, OWN_SOURCE } from './credits';

/** An icon of a built-in package, in the cleaned SVG text given. */
function icon(id: string, name: string, svg: string): SvgImage {
  return {
    kind: 'svg',
    id,
    name,
    source: OWN_SOURCE,
    license: OWN_LICENSE,
    width: 24,
    height: 24,
    svg,
  };
}

/** A box holding a grid of four smaller ones: a system made of parts. */
export const SOFTWARE_SYSTEM_ICON = icon(
  'c4.software-system-icon',
  'Software system',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="18" rx="3" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="18" x="3" y="3"/><rect fill="#3F7AC0" height="4" rx="1" width="4" x="7" y="7"/><rect fill="#3F7AC0" height="4" rx="1" width="4" x="13" y="7"/><rect fill="#3F7AC0" height="4" rx="1" width="4" x="7" y="13"/><rect fill="#3F7AC0" height="4" rx="1" width="4" x="13" y="13"/></svg>',
);

/** A shipping container with its lid: something deployed on its own. */
export const CONTAINER_ICON = icon(
  'c4.container-icon',
  'Container',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 7l2-3h10l2 3" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><rect fill="none" height="13" rx="2" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="20" x="2" y="7"/><path d="M7 11v5M12 11v5M17 11v5" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A block with two tabs, as UML draws a component. */
export const COMPONENT_ICON = icon(
  'c4.component-icon',
  'Component',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="18" rx="2" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="14" x="7" y="3"/><rect fill="#3F7AC0" height="3" rx="1" width="7" x="3" y="7"/><rect fill="#3F7AC0" height="3" rx="1" width="7" x="3" y="14"/></svg>',
);

/** Two servers in a rack. */
export const DEPLOYMENT_NODE_ICON = icon(
  'c4.deployment-node-icon',
  'Deployment node',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="8" rx="2" stroke="#64748B" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="18" x="3" y="3"/><rect fill="none" height="8" rx="2" stroke="#64748B" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="18" x="3" y="13"/><circle cx="7" cy="7" fill="#64748B" r="1.5"/><circle cx="7" cy="17" fill="#64748B" r="1.5"/><path d="M11 7h6M11 17h6" fill="none" stroke="#64748B" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A store of records, drawn as a cylinder with a band. */
export const SOURCE_ICON = icon(
  'data-science.source-icon',
  'Source',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="5" fill="none" rx="8" ry="3" stroke="#2F8A57" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" fill="none" stroke="#2F8A57" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" fill="none" stroke="#2F8A57" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** Two arrows that swap ways: data turned into other data. */
export const TRANSFORM_ICON = icon(
  'data-science.transform-icon',
  'Transform',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h12M13 3l4 4-4 4" fill="none" stroke="#A86E0A" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M20 17H8M11 13l-4 4 4 4" fill="none" stroke="#A86E0A" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A grid of cells: features kept by entity and name. */
export const FEATURE_STORE_ICON = icon(
  'data-science.feature-store-icon',
  'Feature store',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="18" rx="2" stroke="#7A5BC4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="18" x="3" y="3"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" fill="none" stroke="#7A5BC4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** Units in three layers, each joined to the next: a model that learns. */
export const MODEL_ICON = icon(
  'data-science.model-icon',
  'Model',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 6l7 6M5 18l7-6M12 12l7-6M12 12l7 6" fill="none" stroke="#B83F72" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="5" cy="6" fill="#B83F72" r="2.5"/><circle cx="5" cy="18" fill="#B83F72" r="2.5"/><circle cx="12" cy="12" fill="#B83F72" r="2.5"/><circle cx="19" cy="6" fill="#B83F72" r="2.5"/><circle cx="19" cy="18" fill="#B83F72" r="2.5"/></svg>',
);

/** Three bars that rise: numbers shown to people. */
export const DASHBOARD_ICON = icon(
  'data-science.dashboard-icon',
  'Dashboard',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 21h18" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><rect fill="#21897C" height="7" rx="1" width="3" x="5" y="12"/><rect fill="#21897C" height="12" rx="1" width="3" x="10.5" y="7"/><rect fill="#21897C" height="16" rx="1" width="3" x="16" y="3"/></svg>',
);
