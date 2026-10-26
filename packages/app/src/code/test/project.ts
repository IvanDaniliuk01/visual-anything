/** A small project with a package of the project's own that holds code, for the tests of package code. */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';

/** The module the gauges package holds: a unit converter, a check and a gauge. */
export const GAUGES_CODE = [
  'export function attributes(element) {',
  '  const celsius = element.attributes.celsius;',
  '  if (typeof celsius !== "number") return {};',
  '  return { fahrenheit: Math.round((celsius * 9) / 5 + 32) };',
  '}',
  'export function check(element) {',
  '  return element.attributes.celsius > 90 ? ["Over 90 °C."] : [];',
  '}',
  'export function draw(element) {',
  '  const celsius = element.attributes.celsius ?? 0;',
  '  return {',
  '    width: 100,',
  '    height: 60,',
  '    items: [',
  '      { kind: "arc", x: 50, y: 55, radius: 40, from: 180, to: 360, stroke: "#888888", strokeWidth: 6 },',
  '      { kind: "text", x: 50, y: 55, text: `${celsius} °C`, align: "middle", size: 14 },',
  '    ],',
  '  };',
  '}',
];

export function gaugesPackage(code: string[] = GAUGES_CODE, capabilities?: string[]): PackageFile {
  return {
    id: 'gauges',
    name: 'Gauges',
    components: [
      {
        id: 'gauges.thermometer',
        name: 'Thermometer',
        derivesFrom: 'essence',
        attributes: [{ name: 'celsius', type: 'number', unit: '°C' }],
      },
    ],
    relationTypes: [
      { id: 'gauges.feeds', name: 'feeds', derivesFrom: 'relates-to', direction: 'directed' },
      { id: 'gauges.inside', name: 'is inside', derivesFrom: 'relates-to', nests: true },
    ],
    code,
    ...(capabilities === undefined ? {} : { capabilities }),
  };
}

/** A kitchen holding an oven and a fridge, with a database the oven feeds. */
export function codeProject(pkg: PackageFile = gaugesPackage()): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Kitchen', packages: ['gauges'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'kitchen', component: 'essence', name: 'Kitchen' },
        {
          id: 'oven',
          component: 'gauges.thermometer',
          name: 'Oven',
          attributes: { celsius: 100 },
        },
        {
          id: 'fridge',
          component: 'gauges.thermometer',
          name: 'Fridge',
          attributes: { celsius: 4 },
        },
        { id: 'db', component: 'essence', name: 'DB' },
        { id: 'loose', component: 'gauges.thermometer', name: 'Loose' },
        { id: 'plain', component: 'essence', name: 'Plain' },
      ],
      relations: [
        { id: 'oven-in-kitchen', relationType: 'gauges.inside', from: 'oven', to: 'kitchen' },
        { id: 'fridge-in-kitchen', relationType: 'gauges.inside', from: 'fridge', to: 'kitchen' },
        { id: 'fridge-feeds-db', relationType: 'gauges.feeds', from: 'fridge', to: 'db' },
      ],
    },
    packages: [pkg],
    views: [
      {
        id: 'kitchen',
        name: 'Kitchen',
        perspective: { name: 'Heat' },
        nestingRelationTypes: ['gauges.inside'],
        positions: [],
        freeShapes: [],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}
