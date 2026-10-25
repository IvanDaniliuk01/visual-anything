/**
 * Crosswalks and matching by external identifier (ADR 0056). A crosswalk is a table a package ships,
 * as data, that maps the identifiers of one scheme to another's. An importer uses them to fill in the
 * schemes a file lacks, then matches each planned element to the element of the project that shares
 * one of its identifiers, so that importing again updates it, as ADR-0042's key does. Nothing here
 * follows an identifier anywhere.
 */
import type {
  Element,
  ExternalId,
  ExternalIds,
  Id,
  IdScheme,
  PackageFile,
} from '@visual-anything/schema';
import { elementsWithExternalId, isExternalId, isScheme, MAX_SCHEMES } from '../external-ids';
import type { ProjectSnapshot } from '../snapshot';
import type { ImportPlan, PlannedElement } from './plan';

/** A crosswalk as importers use it: its entries in a map, which no key reaches a prototype through. */
export interface CrosswalkTable {
  from: IdScheme;
  to: IdScheme;
  entries: ReadonlyMap<ExternalId, ExternalId>;
  /** The package that ships it. */
  package: Id;
}

const TABLES = new WeakMap<PackageFile, CrosswalkTable[]>();

/**
 * The crosswalks of the packages in use, in their order and each package's. A table that maps a
 * scheme to itself, or whose entries are not identifiers, is left out or kept without them.
 */
export function crosswalksOf(state: ProjectSnapshot): CrosswalkTable[] {
  return state.packages.flatMap((file) => {
    let tables = TABLES.get(file);
    if (tables === undefined) {
      tables = (file.crosswalks ?? []).flatMap((crosswalk): CrosswalkTable[] => {
        if (
          !isScheme(crosswalk.from) ||
          !isScheme(crosswalk.to) ||
          crosswalk.from === crosswalk.to
        ) {
          return [];
        }
        const entries = new Map<ExternalId, ExternalId>();
        for (const [key, value] of Object.entries(crosswalk.entries)) {
          if (isExternalId(key) && isExternalId(value)) entries.set(key, value);
        }
        return [{ from: crosswalk.from, to: crosswalk.to, entries, package: file.id }];
      });
      TABLES.set(file, tables);
    }
    return tables;
  });
}

/** Each table's entries read backwards, only where one identifier maps to the one asked about. */
const BACKWARDS = new WeakMap<CrosswalkTable, ReadonlyMap<ExternalId, ExternalId>>();

function backwardsOf(table: CrosswalkTable): ReadonlyMap<ExternalId, ExternalId> {
  let found = BACKWARDS.get(table);
  if (found === undefined) {
    const map = new Map<ExternalId, ExternalId | null>();
    for (const [key, value] of table.entries) map.set(value, map.has(value) ? null : key);
    found = new Map(
      [...map].filter((entry): entry is [ExternalId, ExternalId] => entry[1] !== null),
    );
    BACKWARDS.set(table, found);
  }
  return found;
}

/**
 * Identifiers with the schemes they lack filled in from crosswalks, forwards, and backwards where
 * only one identifier maps to the one known, through as many tables as it takes. An identifier given
 * is never changed. `undefined` when there are none.
 */
export function completedIds(
  ids: ExternalIds | undefined,
  tables: readonly CrosswalkTable[],
): ExternalIds | undefined {
  if (ids === undefined) return undefined;
  const known = new Map<IdScheme, ExternalId>(Object.entries(ids));
  let added = true;
  while (added && known.size < MAX_SCHEMES) {
    added = false;
    for (const table of tables) {
      const forwards = known.get(table.from);
      if (forwards !== undefined && !known.has(table.to)) {
        const found = table.entries.get(forwards);
        if (found !== undefined) {
          known.set(table.to, found);
          added = true;
        }
      }
      const backwards = known.get(table.to);
      if (backwards !== undefined && !known.has(table.from)) {
        const found = backwardsOf(table).get(backwards);
        if (found !== undefined) {
          known.set(table.from, found);
          added = true;
        }
      }
    }
  }
  return Object.fromEntries([...known].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** A planned element's identifiers that are identifiers, and what it gave that is not. */
function sanitized(element: PlannedElement): { ids?: ExternalIds; left: string[] } {
  const given: unknown = element.ids;
  if (given === undefined) return { left: [] };
  if (typeof given !== 'object' || given === null || Array.isArray(given)) {
    return { left: ['Its identifiers are not given by scheme, so it is imported without them.'] };
  }
  const kept: [IdScheme, ExternalId][] = [];
  const left: string[] = [];
  for (const [scheme, identifier] of Object.entries(given as Record<string, unknown>)) {
    if (!isScheme(scheme)) {
      left.push(
        `"${String(scheme)}" is not a scheme of identifiers, so it is imported without that one.`,
      );
    } else if (!isExternalId(identifier)) {
      left.push(`Its ${scheme} identifier is not one, so it is imported without it.`);
    } else if (kept.length >= MAX_SCHEMES) {
      left.push(
        `Its ${scheme} identifier is past ${MAX_SCHEMES} schemes, so it is imported without it.`,
      );
    } else kept.push([scheme, identifier]);
  }
  return kept.length === 0 ? { left } : { ids: Object.fromEntries(kept), left };
}

/** A list of names as English writes it: "A", "A and B", "A, B and C". */
function namesOf(elements: readonly Element[]): string {
  const names = elements.map((element) => `"${element.name}"`);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1) as string}`;
}

/**
 * The plan with each element's identifiers checked and completed from the crosswalks, and matched to
 * the element of the project that shares one of them, which it then updates rather than creates.
 * What is not an identifier is left out and reported in `unmatched`; so is an identifier several
 * elements share, and a second row of the file for an element a row before it matched. An element the
 * plan matched already, by another key, stays matched.
 */
export function matchByExternalIds(
  state: ProjectSnapshot,
  plan: ImportPlan,
  tables: readonly CrosswalkTable[] = crosswalksOf(state),
): ImportPlan {
  const unmatched = [...plan.unmatched];
  const taken = new Set<Id>(
    plan.elements.flatMap((element) => (element.existing === undefined ? [] : [element.existing])),
  );
  const elements = plan.elements.map((element): PlannedElement => {
    const { ids: given, left } = sanitized(element);
    for (const why of left) {
      unmatched.push({ text: element.name, why });
    }
    const rest: PlannedElement = { ...element };
    delete rest.ids;
    const ids = completedIds(given, tables);
    const next: PlannedElement = ids === undefined ? rest : { ...rest, ids };
    if (ids === undefined || next.existing !== undefined) return next;
    for (const [scheme, identifier] of Object.entries(ids)) {
      const sharing = elementsWithExternalId(state, identifier, scheme);
      if (sharing.length === 0) continue;
      if (sharing.length > 1) {
        unmatched.push({
          text: element.name,
          why: `Its ${scheme} identifier "${identifier}" is the identifier of ${sharing.length} elements, ${namesOf(sharing)}, so it is imported as a new element.`,
        });
        return next;
      }
      const [match] = sharing as [Element];
      if (taken.has(match.id)) {
        unmatched.push({
          text: element.name,
          why: `Its ${scheme} identifier "${identifier}" is that of "${match.name}", which a row before it updates already, so it is imported as a new element.`,
        });
        return next;
      }
      taken.add(match.id);
      return { ...next, existing: match.id };
    }
    return next;
  });
  return { ...plan, elements, unmatched };
}
