/**
 * How Claude's tools write free geometry (ADR 0066) when they read an appearance: in brief, its box,
 * how many contours and holes it has and how many characters of path data and points it holds,
 * since path data can run to 32 KiB a geometry; whole only when Claude asks with `fullGeometry`.
 */
import { geometryText, readGeometry } from '@visual-anything/core';
import type { FreeGeometry, GeometryLabel } from '@visual-anything/schema';
import { z } from 'zod';

/** What the brief says in place of the path data. */
export const PATH_DATA_LEFT_OUT = 'Left out: pass fullGeometry true to read it.';

/** Free geometry in brief. */
export interface GeometryBrief {
  box: { width: number; height: number };
  /** The contours it reads into, each subpath of path data one; a hole is one too. */
  contours: number;
  holes: number;
  /** Characters of path data and points, against the cap of 32 KiB a geometry. */
  characters: number;
  keepProportions?: true;
  label?: GeometryLabel;
  /** Why its shapes are drawn as their kind instead, when it does not read as geometry. */
  drawnAsKind?: string;
  pathData: string;
}

/** The input of the read tools that give appearances. */
export const fullGeometry = () =>
  z
    .boolean()
    .optional()
    .describe(
      'Give free geometry whole, with its path data; left out, each geometry comes in brief: its box, contours, holes and size in characters.',
    );

/** A geometry in brief. */
export function geometryBrief(geometry: FreeGeometry): GeometryBrief {
  const read = readGeometry(geometry);
  const contours = read.ok ? read.outline.contours : [];
  return {
    box: { width: geometry.width, height: geometry.height },
    contours: read.ok ? contours.length : geometry.outline.length,
    holes: contours.filter((each) => each.role === 'hole').length,
    characters: geometryText(geometry),
    ...(geometry.keepProportions === true ? { keepProportions: true as const } : {}),
    ...(geometry.label === undefined ? {} : { label: geometry.label }),
    ...(read.ok ? {} : { drawnAsKind: read.message }),
    pathData: PATH_DATA_LEFT_OUT,
  };
}

/**
 * An appearance as a read tool gives it: its free geometry in brief unless `full`, and everything
 * else as it is.
 */
export function appearanceRead<T extends object>(
  appearance: T,
  full = false,
): T | (Omit<T, 'geometry'> & { geometry: GeometryBrief }) {
  const { geometry } = appearance as { geometry?: FreeGeometry | 'none' };
  if (full || typeof geometry !== 'object') return appearance;
  return { ...appearance, geometry: geometryBrief(geometry) };
}
