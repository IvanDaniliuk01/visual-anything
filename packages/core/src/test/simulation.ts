/** Simulations the tests share (ADR 0085). */
import type { SimulationDefinition } from '@visual-anything/schema';

/** A work queue under load: arrivals, workers, and the queue's length with its limit. */
export const QUEUE: SimulationDefinition = {
  parameters: [
    { name: 'arrivals', type: 'number', default: 10, min: 0, max: 100, step: 1, unit: 'items/s' },
    { name: 'workers', type: 'number', default: 4, min: 1, max: 32, step: 1 },
    { name: 'bursts', type: 'boolean', default: false },
    { name: 'policy', type: 'choice', default: 'fifo', choices: ['fifo', 'priority'] },
  ],
  values: [
    { name: 'queue', type: 'number', min: 0, max: 5000, unit: 'items' },
    { name: 'phase', type: 'string', choices: ['calm', 'busy'] },
    { name: 'saturated', type: 'boolean' },
  ],
  tick: { length: 1, unit: 's' },
  ticks: 500,
};
