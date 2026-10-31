// @vitest-environment node
/**
 * The ground (ADR 0076): a grid on y = 0 whose cells are a power of ten meters following the
 * camera's distance, drawn relative to the camera's target, and a scale saying one cell's length.
 */
import { describe, expect, it } from 'vitest';
import { GRID_REACH, gridCell, gridOf, heightAt, lengthLabel, scaleOf } from './grid';

describe('the ground', () => {
  it('keeps from 8 to 80 cells across the frame’s height at the target', () => {
    for (const distance of [0.01, 0.3, 3, 9, 10, 42, 1_000, 250_000]) {
      const cells = heightAt(distance) / gridCell(distance);
      expect(cells, String(distance)).toBeGreaterThanOrEqual(8);
      expect(cells, String(distance)).toBeLessThan(80);
      expect(Math.log10(gridCell(distance)) % 1).toBeCloseTo(0, 9);
    }
    expect(gridCell(3)).toBeCloseTo(0.1, 12);
    expect(gridCell(10)).toBe(1);
  });

  it('draws its lines relative to the target, on y = 0, every tenth one stronger', () => {
    const camera = {
      target: { x: 40_000.25, y: 2, z: -90_000 },
      azimuth: 0,
      elevation: 30,
      distance: 10,
    };
    const grid = gridOf(camera);
    expect(grid.cell).toBe(1);
    const lines = (grid.minor.length + grid.major.length) / 6;
    expect(lines).toBe(2 * (2 * GRID_REACH + 1));
    // Every point lies at y = 0, less the target's height.
    for (let at = 1; at < grid.minor.length; at += 3) expect(grid.minor[at]).toBe(-2);
    // Lines cross whole meters, so relative to the target they fall a quarter off on x.
    const xs = new Set<number>();
    for (let at = 0; at < grid.major.length; at += 6) xs.add(Number(grid.major[at]?.toFixed(3)));
    expect([...xs].some((x) => Math.abs(x - -0.25) < 1e-3 || Math.abs(x - 9.75) < 1e-3)).toBe(true);
    // The ground stays near the target, whatever its distance from the origin.
    for (const value of grid.minor) expect(Math.abs(value)).toBeLessThanOrEqual(GRID_REACH + 1);
  });

  it('says one cell’s length in mm, cm, m or km', () => {
    expect(lengthLabel(0.001)).toBe('1 mm');
    expect(lengthLabel(0.01)).toBe('1 cm');
    expect(lengthLabel(0.1)).toBe('10 cm');
    expect(lengthLabel(1)).toBe('1 m');
    expect(lengthLabel(100)).toBe('100 m');
    expect(lengthLabel(1000)).toBe('1 km');
    expect(lengthLabel(10_000)).toBe('10 km');
    const scale = scaleOf(
      { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 3 },
      400,
    );
    expect(scale.label).toBe('10 cm');
    expect(scale.pixels).toBeCloseTo((0.1 / heightAt(3)) * 400, 9);
  });
});
