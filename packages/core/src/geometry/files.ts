/**
 * Free geometry across a project's files (ADR 0066): what opening warns about, and which geometries
 * are drawn as their shapes' kind instead, because they are not geometry or come, in file order,
 * past the most geometry text a package or a model may hold.
 */
import type { FreeGeometry, Id } from '@visual-anything/schema';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { GEOMETRY_FILE_CAPS, geometryText, readGeometry } from './outline';

/** What opening says of a project's free geometry, and the geometries drawn as their kind. */
export interface GeometryFindings {
  warnings: Problem[];
  /** The geometries the canvas, layout and the exports draw as their shapes' kind. */
  drawnAsKind: ReadonlySet<FreeGeometry>;
}

const findingsByState = new WeakMap<
  object,
  { model: unknown; packages: unknown; findings: GeometryFindings }
>();

/** The project's free geometry, checked once for each model and list of packages. */
export function geometryFindings(state: ProjectSnapshot): GeometryFindings {
  const kept = findingsByState.get(state.project);
  if (kept && kept.model === state.model && kept.packages === state.packages) return kept.findings;
  const findings = find(state);
  findingsByState.set(state.project, { model: state.model, packages: state.packages, findings });
  return findings;
}

function find(state: ProjectSnapshot): GeometryFindings {
  const warnings: Problem[] = [];
  const drawnAsKind = new Set<FreeGeometry>();
  const read = (geometry: FreeGeometry, of: string, subject: Id) => {
    const result = readGeometry(geometry);
    if (result.ok) return true;
    drawnAsKind.add(geometry);
    warnings.push(
      problem(
        result.code,
        `The free geometry of ${of}: ${result.message} Its shapes are drawn as their kind.`,
        [subject],
      ),
    );
    return false;
  };
  /** Geometries in file order, each counted against its file's cap once it reads as geometry. */
  const capped = (
    entries: readonly { geometry: FreeGeometry; of: string; subject: Id }[],
    cap: number,
    warning: number,
    file: string,
  ) => {
    let total = 0;
    let past = 0;
    for (const { geometry, of, subject } of entries) {
      if (!read(geometry, of, subject)) continue;
      total += geometryText(geometry);
      if (total > cap) {
        drawnAsKind.add(geometry);
        past += 1;
      }
    }
    if (total > warning) {
      warnings.push(
        problem(
          'large-geometry',
          past === 0
            ? `${file} holds ${kib(total)} of free geometry, which slows saving it; it may hold at most ${kib(cap)}.`
            : past === 1
              ? `${file} holds ${kib(total)} of free geometry, past the ${kib(cap)} it may hold: the last geometry is drawn as its shapes' kind.`
              : `${file} holds ${kib(total)} of free geometry, past the ${kib(cap)} it may hold: the last ${past} geometries are drawn as their shapes' kind.`,
        ),
      );
    }
  };
  for (const file of state.packages) {
    const entries = file.components.flatMap((component) => {
      const geometry = component.appearance?.geometry;
      return typeof geometry === 'object'
        ? [{ geometry, of: `the component "${component.name}"`, subject: component.id }]
        : [];
    });
    capped(
      entries,
      GEOMETRY_FILE_CAPS.package,
      GEOMETRY_FILE_CAPS.packageWarning,
      `The package "${file.name}"`,
    );
  }
  const elements = [state.model.world, ...state.model.elements].flatMap((element) => {
    const geometry = element.appearance?.geometry;
    return typeof geometry === 'object'
      ? [{ geometry, of: `the element "${element.name}"`, subject: element.id }]
      : [];
  });
  capped(elements, GEOMETRY_FILE_CAPS.model, GEOMETRY_FILE_CAPS.modelWarning, 'The model');
  // Project appearances hold geometry for built-in components; they are read, and not capped as files.
  for (const [id, appearance] of Object.entries(state.project.appearances?.components ?? {})) {
    if (typeof appearance.geometry === 'object') {
      read(appearance.geometry, `the project appearance of "${id}"`, id);
    }
  }
  return { warnings, drawnAsKind };
}

function kib(bytes: number): string {
  return `${Math.round(bytes / 1024).toLocaleString('en')} KiB`;
}
