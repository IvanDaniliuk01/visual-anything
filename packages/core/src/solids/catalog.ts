/**
 * The solids of the packages a project uses, and which appearances show them (ADR 0075), as images'
 * catalog does for images (ADR 0027). An appearance names a solid by id; a component inherits the solid
 * of the nearest definition in its chain that sets one, an element's own appearance comes first, and
 * `none` stops an inherited solid.
 */
import type {
  Appearance,
  AppearanceSolid,
  Element,
  Id,
  PackageFile,
  PartReference,
  SolidDefinition,
  SolidPart,
} from '@visual-anything/schema';
import type { Defined, Definitions } from '../definitions';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { MAX_PACKAGE_SOLID_BYTES, MAX_PROJECT_SOLID_BYTES } from './caps';

/** The solids of a set of packages. */
export interface SolidCatalog {
  /** Every solid the packages define, by id; the first one when an id is defined twice. */
  readonly solids: ReadonlyMap<Id, Defined<SolidDefinition>>;
  /** The solid a package in use defines with this id. */
  solid(id: Id): Defined<SolidDefinition> | undefined;
  /**
   * The solids past their package's 256 MiB, or the project's 512 MiB, of files, in file order: they
   * are drawn as their placeholders.
   */
  readonly pastTotal: ReadonlySet<Id>;
  /** Solids defined twice, or whose ids do not start with their package's id. */
  readonly problems: readonly Problem[];
}

const catalogs = new WeakMap<readonly PackageFile[], SolidCatalog>();

/** The solids of the given packages. Repeated calls with the same array share the result. */
export function solidsOf(packages: readonly PackageFile[]): SolidCatalog {
  let catalog = catalogs.get(packages);
  if (!catalog) {
    catalog = buildCatalog(packages);
    catalogs.set(packages, catalog);
  }
  return catalog;
}

/** The solids of the packages a project uses. */
export function solidsIn(state: ProjectSnapshot): SolidCatalog {
  return solidsOf(state.packages);
}

function buildCatalog(packages: readonly PackageFile[]): SolidCatalog {
  const solids = new Map<Id, Defined<SolidDefinition>>();
  const pastTotal = new Set<Id>();
  const problems: Problem[] = [];
  let projectTotal = 0;
  for (const file of packages) {
    let total = 0;
    for (const solid of file.solids ?? []) {
      total += solid.bytes;
      projectTotal += solid.bytes;
      if (total > MAX_PACKAGE_SOLID_BYTES || projectTotal > MAX_PROJECT_SOLID_BYTES) {
        pastTotal.add(solid.id);
      }
      const first = solids.get(solid.id);
      if (first) {
        problems.push(
          problem(
            'defined-twice',
            `The solid "${solid.id}" is defined by package "${first.package}" and again by "${file.id}".`,
            [solid.id, file.id],
          ),
        );
        continue;
      }
      if (!solid.id.startsWith(`${file.id}.`)) {
        problems.push(
          problem(
            'id-outside-package',
            `The solid "${solid.id}" of package "${file.id}" should start with "${file.id}.".`,
            [solid.id, file.id],
          ),
        );
      }
      solids.set(solid.id, { definition: solid, package: file.id });
    }
  }
  return { solids, solid: (id) => solids.get(id), pastTotal, problems };
}

/**
 * The solid an appearance chain shows, nearest first: the nearest one that sets a solid, or none when
 * that one says `none` or no one sets one.
 */
export function resolveSolid(
  chain: readonly (Appearance | undefined)[],
): AppearanceSolid | undefined {
  for (const appearance of chain) {
    const solid = appearance?.solid;
    if (solid === 'none') return undefined;
    if (solid !== undefined) return solid;
  }
  return undefined;
}

const componentSolids = new WeakMap<Definitions, Map<Id, AppearanceSolid | null>>();

/** The solid a component's shapes show, from its own appearance or the nearest it inherits. */
export function componentSolid(
  definitions: Definitions,
  componentId: Id,
): AppearanceSolid | undefined {
  let byComponent = componentSolids.get(definitions);
  if (!byComponent) {
    byComponent = new Map();
    componentSolids.set(definitions, byComponent);
  }
  let solid = byComponent.get(componentId);
  if (solid === undefined) {
    const lineage = definitions.component(componentId)?.lineage ?? [];
    solid =
      resolveSolid(lineage.map((id) => definitions.components.get(id)?.definition.appearance)) ??
      null;
    byComponent.set(componentId, solid);
  }
  return solid ?? undefined;
}

/** The solid an element's shapes show: its own appearance's, otherwise its component's. */
export function solidShownBy(
  element: { component: Id; appearance?: Appearance },
  definitions: Definitions,
): AppearanceSolid | undefined {
  const own = element.appearance?.solid;
  if (own === 'none') return undefined;
  return own ?? componentSolid(definitions, element.component);
}

/** The id of the solid an appearance names, if it names one. */
export function solidIdOf(appearance: Appearance | undefined): Id | undefined {
  const solid = appearance?.solid;
  return solid === undefined || solid === 'none' ? undefined : solid.solid;
}

/** The solid a part reference names, if it names one. */
export function partSolidId(part: PartReference | 'none' | undefined): Id | undefined {
  return part === undefined || part === 'none' ? undefined : part.solid;
}

/**
 * What names a solid in its appearance, as the solid it shows or as the solid of the part it is drawn
 * as: components of any package, the components the project gives an appearance of its own (ADR 0034),
 * and elements, World included. Each once. A solid any of them names cannot be removed (`in-use`).
 */
export function solidUsers(state: ProjectSnapshot, solidId: Id): Id[] {
  const users = new Set<Id>();
  const names = (appearance: Appearance | undefined) =>
    solidIdOf(appearance) === solidId || partSolidId(appearance?.part) === solidId;
  for (const file of state.packages) {
    for (const component of file.components) {
      if (names(component.appearance)) users.add(component.id);
    }
  }
  for (const [id, appearance] of Object.entries(state.project.appearances?.components ?? {})) {
    if (names(appearance)) users.add(id);
  }
  for (const element of [state.model.world, ...state.model.elements] as Element[]) {
    if (names(element.appearance)) users.add(element.id);
  }
  return [...users];
}

/**
 * The parts a solid's anchored elements are drawn as that a replacement would lose (ADR 0075): the
 * names of anchored parts the new parts lack, each with the elements drawn as it, in the model's
 * order. An element is anchored to the solid when its own appearance names the part with the solid,
 * or names the part alone and one of its containers shows the solid with its parts, as Anchor parts…
 * anchors them. The replace dialog and `replace_solid` say them before the replacement applies; after
 * it they warn `unknown-part`, and an undo brings them back.
 */
export function solidPartsLostByReplacing(
  state: ProjectSnapshot,
  solidId: Id,
  newParts: readonly SolidPart[],
): { part: string; elements: Id[] }[] {
  const kept = new Set(newParts.map((part) => part.name));
  const index = modelIndexOf(state);
  const definitions = definitionsIn(state);
  // The drawings with parts that show the solid, whose contents may name its parts alone.
  const drawings = new Set<Id>();
  const showsIt = (id: Id) => {
    const container = index.element(id);
    if (!container) return false;
    const shown = solidShownBy(container, definitions);
    return shown?.solid === solidId && shown.placement === 'parts';
  };
  const lost = new Map<string, Id[]>();
  for (const element of [state.model.world, ...state.model.elements] as Element[]) {
    const part = element.appearance?.part;
    if (part === undefined || part === 'none' || part.image !== undefined) continue;
    if (kept.has(part.part)) continue;
    const anchored =
      part.solid === undefined
        ? index.containersOf(element.id).some((id) => {
            if (drawings.has(id)) return true;
            if (!showsIt(id)) return false;
            drawings.add(id);
            return true;
          })
        : part.solid === solidId;
    if (!anchored) continue;
    lost.set(part.part, [...(lost.get(part.part) ?? []), element.id]);
  }
  return [...lost].map(([part, elements]) => ({ part, elements }));
}
