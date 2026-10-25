/**
 * JSON for the reader's tests: a project's own model file, the simple form of elements and relations,
 * and hostile ones. Kept as text here, since the core's tests load no files.
 */

/** A model file: Systems elements, a relation on a relation, one to World, an appearance of its own. */
export const MODEL_FILE = JSON.stringify(
  {
    world: { id: 'world', component: 'essence', name: 'World' },
    elements: [
      { id: 'shop', component: 'systems.system', name: 'Shop' },
      {
        id: 'api',
        component: 'systems.service',
        name: 'Checkout API',
        description: 'Takes the orders.',
        attributes: { technology: 'Node.js' },
      },
      {
        id: 'orders',
        component: 'systems.database',
        name: 'Orders',
        appearance: { fill: '#FFEECC' },
      },
      { id: 'contract', component: 'clinic.contract', name: 'Contract' },
    ],
    relations: [
      { id: 'api-in-shop', relationType: 'systems.is-part-of', from: 'api', to: 'shop' },
      {
        id: 'governs',
        relationType: 'relates-to',
        from: 'contract',
        to: 'api-writes',
      },
      {
        id: 'api-writes',
        relationType: 'systems.writes-to',
        from: 'api',
        to: 'orders',
        name: 'Stores orders',
        description: 'Every order, once paid.',
      },
      { id: 'in-world', relationType: 'systems.is-part-of', from: 'shop', to: 'world' },
    ],
  },
  null,
  2,
);

/** The simple form: elements with containers by id or name, relations by id or name. */
export const SIMPLE_FORM = JSON.stringify({
  elements: [
    { id: 'shop', name: 'Shop', component: 'System' },
    { id: 'api', name: 'Checkout API', component: 'Service', container: 'shop' },
    {
      name: 'Orders',
      component: 'Database',
      container: 'Shop',
      attributes: { engine: 'postgres', replicas: 3 },
    },
  ],
  relations: [
    { from: 'api', to: 'Orders', relationType: 'writes to', name: 'Stores orders' },
    { id: 'r2', from: 'Orders', to: 'shop', attributes: { weight: 0.5 } },
  ],
});
