/**
 * The benchmark's phases for package code (ADR 0054), with `?code`: every element shape draws a
 * gauge, as the sample's `draw` answers one, and the camera pans and zooms over them where names
 * show, then where details show. The drawings are made here, as the worker would answer them, so that
 * only what the canvas does with them is measured, never the interpreter.
 */
import type { Drawing } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Scene } from '../canvas/scene';

/** A gauge for every element the scene draws, its needle at a place of its own. */
export function gaugeDrawings(scene: Scene): Map<Id, Drawing> {
  const drawings = new Map<Id, Drawing>();
  let at = 0;
  for (const shape of scene.shapes) {
    if (drawings.has(shape.element)) continue;
    at += 1;
    const share = ((at * 37) % 100) / 100;
    const angle = 180 + share * 180;
    const radians = (angle * Math.PI) / 180;
    drawings.set(shape.element, {
      width: 100,
      height: 66,
      items: [
        {
          kind: 'arc',
          x: 50,
          y: 50,
          radius: 38,
          from: 180,
          to: 360,
          stroke: '#C9CED6',
          strokeWidth: 8,
        },
        {
          kind: 'arc',
          x: 50,
          y: 50,
          radius: 38,
          from: 180,
          to: Math.max(181, angle),
          stroke: share > 0.8 ? '#C62828' : '#2F7D4F',
          strokeWidth: 8,
        },
        {
          kind: 'line',
          points: [
            { x: 50, y: 50 },
            { x: 50 + 30 * Math.cos(radians), y: 50 + 30 * Math.sin(radians) },
          ],
          strokeWidth: 2,
        },
        { kind: 'ellipse', x: 46, y: 46, width: 8, height: 8 },
        {
          kind: 'text',
          x: 50,
          y: 64,
          text: `${Math.round(share * 160 - 40)} °C`,
          align: 'middle',
          size: 11,
        },
      ],
    });
  }
  return drawings;
}
