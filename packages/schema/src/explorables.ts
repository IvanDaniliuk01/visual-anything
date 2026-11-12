/**
 * Explorables and the script libraries they use (ADR 0107). An explorable is a page of HTML, CSS and
 * JavaScript that explains something by letting a person play with it: one file,
 * `explorables/<file>` beside the project, which a package defines and the person may edit in their
 * own editor. It runs only once the person approves it by its hash, in a frame walled off from the
 * app; the file holds it and nothing in it runs while the file is read. A script library is a
 * JavaScript file fetched from the npm registry, checked by its integrity and kept as
 * `script-libraries/<hash>.js`, which runs only inside an approved explorable's frame.
 */
import type { Id, JsonValue, LicenseId } from './files';

/** A value an explorable shows that the person, a tour step or Claude chooses. */
export type ExplorableParameterValue = number | boolean | string;

/** A number a parameter takes, within its range. */
export interface ExplorableNumberParameter {
  /**
   * Its name, as the page reads it from `va.data.parameters`.
   *
   * @pattern ^[A-Za-z_][A-Za-z0-9_]{0,63}$
   */
  name: string;
  kind: 'number';
  /**
   * What the form says of it.
   *
   * @minLength 1
   * @maxLength 200
   */
  label?: string;
  /**
   * @minimum -1000000000000
   * @maximum 1000000000000
   */
  min: number;
  /**
   * @minimum -1000000000000
   * @maximum 1000000000000
   */
  max: number;
  /**
   * The value it has when nothing sets it, within `min` and `max`.
   *
   * @minimum -1000000000000
   * @maximum 1000000000000
   */
  default: number;
}

/** A whole number a parameter takes, within its range. */
export interface ExplorableIntegerParameter {
  /**
   * Its name, as the page reads it from `va.data.parameters`.
   *
   * @pattern ^[A-Za-z_][A-Za-z0-9_]{0,63}$
   */
  name: string;
  kind: 'integer';
  /**
   * What the form says of it.
   *
   * @minLength 1
   * @maxLength 200
   */
  label?: string;
  /**
   * @minimum -1000000000000
   * @maximum 1000000000000
   */
  min: number;
  /**
   * @minimum -1000000000000
   * @maximum 1000000000000
   */
  max: number;
  /**
   * The value it has when nothing sets it, within `min` and `max`.
   *
   * @minimum -1000000000000
   * @maximum 1000000000000
   */
  default: number;
}

/** A yes or no a parameter takes. */
export interface ExplorableBooleanParameter {
  /** @pattern ^[A-Za-z_][A-Za-z0-9_]{0,63}$ */
  name: string;
  kind: 'boolean';
  /**
   * @minLength 1
   * @maxLength 200
   */
  label?: string;
  default: boolean;
}

/** One of listed strings a parameter takes. */
export interface ExplorableChoiceParameter {
  /** @pattern ^[A-Za-z_][A-Za-z0-9_]{0,63}$ */
  name: string;
  kind: 'choice';
  /**
   * @minLength 1
   * @maxLength 200
   */
  label?: string;
  /**
   * The strings it takes.
   *
   * @minItems 1
   * @maxItems 50
   * @uniqueItems true
   */
  choices: string[];
  /** One of `choices`. */
  default: string;
}

/**
 * A value an explorable shows, which the person, a view state, a tour step or Claude chooses.
 *
 * @discriminator kind
 */
export type ExplorableParameter =
  | ExplorableNumberParameter
  | ExplorableIntegerParameter
  | ExplorableBooleanParameter
  | ExplorableChoiceParameter;

/** An explorable a package defines (ADR 0107). */
export interface ExplorableDefinition {
  /** Starts with its package's id, as in `math.quadratic-k3f9q2`. */
  id: Id;
  /**
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  /**
   * What it explains, which its card, the approval dialog and the outline give.
   *
   * @maxLength 1000
   */
  description?: string;
  /**
   * The name of its file inside `explorables/`, such as `quadratic.html`.
   *
   * @pattern ^[a-z0-9][a-z0-9-]{0,62}\.html$
   */
  file: string;
  /**
   * The script libraries it uses, by their ids in the same package, inlined into its frame in this
   * order. Left out when it uses none.
   *
   * @minItems 1
   * @maxItems 16
   * @uniqueItems true
   */
  scriptLibraries?: Id[];
  /**
   * The values it shows that others choose, by name. Left out when it has none.
   *
   * @minItems 1
   * @maxItems 32
   */
  parameters?: ExplorableParameter[];
  /** The version of the `va` API it was written for. */
  api: 1;
  /**
   * The SHA-256 of its file's text as the program last read it, in lowercase hexadecimal.
   *
   * @pattern ^[0-9a-f]{64}$
   */
  hash: string;
}

/** A JavaScript library from the npm registry that explorables use (ADR 0107). */
export interface ScriptLibraryDefinition {
  /** Starts with its package's id, as in `math.d3`. */
  id: Id;
  /**
   * Its npm package, such as `d3` or `@scope/name`.
   *
   * @pattern ^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$
   * @maxLength 214
   */
  npm: string;
  /**
   * Its exact version.
   *
   * @pattern ^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$
   * @maxLength 100
   */
  version: string;
  /**
   * The tarball's address on the registry, `https://registry.npmjs.org/…`.
   *
   * @pattern ^https://registry\.npmjs\.org/
   * @maxLength 1000
   */
  tarball: string;
  /**
   * The registry's integrity of the tarball, `sha512-` and its base64.
   *
   * @pattern ^sha512-[A-Za-z0-9+/]{86}==$
   */
  integrity: string;
  /**
   * The file it keeps from the tarball, by its path inside the package, such as
   * `dist/d3.min.js`.
   *
   * @minLength 1
   * @maxLength 500
   */
  path: string;
  /** Its license, by the SPDX identifier the package gives. */
  license?: LicenseId;
  /**
   * The global its file sets, such as `d3`.
   *
   * @pattern ^[A-Za-z_$][A-Za-z0-9_$]{0,63}$
   */
  global: string;
  /**
   * The SHA-256 of the kept file, which names it `script-libraries/<hash>.js`.
   *
   * @pattern ^[0-9a-f]{64}$
   */
  hash: string;
  /**
   * The size of the kept file, in bytes.
   *
   * @minimum 1
   * @maximum 16777216
   * @asType integer
   */
  bytes: number;
}

/** The explorable an appearance shows (ADR 0107). */
export interface AppearanceExplorable {
  /** The explorable, by its id. */
  explorable: Id;
}

/** What a tour step's explorable shows while the step plays (ADR 0107). */
export interface TourExplorable {
  /** The explorable, by its id. */
  id: Id;
  /**
   * The values the step sets, by parameter name; a parameter left out takes its default, and one
   * the explorable no longer declares makes the step a broken step. Each value is a number, a
   * boolean or a string, as its parameter's kind takes, which the core checks.
   */
  parameters?: Record<string, JsonValue>;
}
