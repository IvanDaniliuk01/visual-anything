import { emphasisRuns } from '@visual-anything/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { HoverCard } from './HoverCard';
import { cutOnCanvas } from './hoverCut';
import { buildScene, type ElementShape } from './scene';

const scene = buildScene(loadSample(), 'system-overview');
const whatsapp = scene.shapes.find((shape) => shape.element === 'whatsapp') as ElementShape;
const LONG =
  'Una corrida de auditoría que lee las fichas del día, compara lo facturado con lo atendido y deja una nota por cada diferencia que encuentra';

describe('a shape’s hover card (ADR 0082)', () => {
  it('shows for a shape whose detail or name the canvas cut, and not for one it holds whole', () => {
    expect(cutOnCanvas(whatsapp)).toBe(false);
    expect(cutOnCanvas({ ...whatsapp, detail: LONG })).toBe(true);
    expect(cutOnCanvas({ ...whatsapp, name: LONG })).toBe(true);
    // Five lines hold what three cannot, in a shape tall enough for them.
    const tall = { ...whatsapp, rect: { ...whatsapp.rect, width: 240, height: 200 } };
    expect(cutOnCanvas({ ...tall, detail: LONG })).toBe(true);
    expect(cutOnCanvas({ ...tall, detail: LONG, detailLines: 6 })).toBe(false);
  });

  it('writes the name and the whole detail with its emphasis, as text', () => {
    const detail = `the **orders** table, ${LONG}`;
    const { container } = render(
      <HoverCard
        shape={{ ...whatsapp, detail, detailRuns: emphasisRuns(detail) }}
        at={{ x: 10, y: 20 }}
      />,
    );
    const card = container.querySelector('.canvas-hover-card') as HTMLElement;
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(card.textContent).toBe(`${whatsapp.name}the orders table, ${LONG}`);
    expect(container.querySelector('strong')?.textContent).toBe('orders');
    expect(card.style.transform).toBe('translate(10px, 20px)');
  });

  it('writes markup in a detail that takes no emphasis as the characters it is', () => {
    render(<HoverCard shape={{ ...whatsapp, detail: '<b>**x**</b>' }} at={{ x: 0, y: 0 }} />);
    expect(screen.getByText('<b>**x**</b>', { selector: 'div' })).toBeTruthy();
  });
});
