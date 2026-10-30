import { compileFace, emphasisRuns } from '@visual-anything/core';
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { HoverCard } from './HoverCard';
import { OVAL, outlinedShape } from '../test/outlined';
import { cutOnCanvas } from './hoverCut';
import { useHoverCard } from './useHoverCard';
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

  it('tells a shape with its own outline cut by its wrapped block, not by one line', () => {
    const box = outlinedShape('oval', OVAL, { x: 0, y: 0, width: 320, height: 240 });
    // A name of two lines that fits whole, and a detail of three lines, are not cut.
    const twoWords = 'Facturación electrónica de prestaciones';
    expect(cutOnCanvas({ ...box, name: twoWords, detail: LONG.slice(0, 90) })).toBe(false);
    // A detail longer than its lines is.
    expect(cutOnCanvas({ ...box, name: 'Auditoría', detail: LONG, detailLines: 1 })).toBe(true);
  });

  it('tells a row cut by its source, not by a "…" the detail ends in', () => {
    const row = { ...whatsapp, fitted: { name: whatsapp.name, detail: 'varchar…' } };
    expect(cutOnCanvas(row)).toBe(false);
    expect(cutOnCanvas({ ...row, fitted: { ...row.fitted, detailCut: true } })).toBe(true);
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

  it('shows 400 ms after the pointer rests, and goes when it leaves', () => {
    vi.useFakeTimers();
    try {
      const cut = { ...whatsapp, detail: LONG };
      const { result } = renderHook(() =>
        useHoverCard((key) => (key === cut.key ? cut : undefined)),
      );
      act(() => result.current[1](cut.key));
      act(() => {
        vi.advanceTimersByTime(399);
      });
      expect(result.current[0]).toBeUndefined();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current[0]).toBe(cut.key);
      act(() => result.current[1](undefined));
      expect(result.current[0]).toBeUndefined();
      // A shape the canvas holds whole shows none.
      const { result: whole } = renderHook(() => useHoverCard(() => whatsapp));
      act(() => whole.current[1](whatsapp.key));
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(whole.current[0]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes markup in a detail that takes no emphasis as the characters it is', () => {
    render(<HoverCard shape={{ ...whatsapp, detail: '<b>**x**</b>' }} at={{ x: 0, y: 0 }} />);
    expect(screen.getByText('<b>**x**</b>', { selector: 'div' })).toBeTruthy();
  });

  it('shows for a face the canvas cut, and gives the whole face back, a paragraph a line (ADR 0083)', () => {
    const face = {
      compiled: compileFace({
        size: 'shape',
        markup: ['<b>{{name}}</b>', '<p>{{component}}</p>', '<p>{{note}}</p>'],
        style: [],
        variants: [],
      }),
      input: {
        name: 'Billing',
        component: 'Service',
        attributes: [{ name: 'note', value: LONG }],
      },
    };
    const small = { ...whatsapp, name: 'Billing', face, rect: { ...whatsapp.rect, height: 40 } };
    expect(cutOnCanvas(small)).toBe(true);
    const tall = { ...small, rect: { ...small.rect, width: 600, height: 400 } };
    expect(cutOnCanvas(tall)).toBe(false);
    render(<HoverCard shape={small} at={{ x: 0, y: 0 }} />);
    expect(screen.getByText('Service', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText(LONG, { selector: 'div' })).toBeTruthy();
  });
});
