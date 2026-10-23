import { isAbsolute, relative, sep } from 'node:path';

/** Writes a path with forward slashes, as the local program shows paths on every platform. */
export function toForwardSlashes(path: string): string {
  return path.replaceAll('\\', '/');
}

/** Whether a path lies strictly inside a folder. Both must be absolute. */
export function isInside(folder: string, path: string): boolean {
  const inside = relative(folder, path);
  return inside !== '' && inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
}
