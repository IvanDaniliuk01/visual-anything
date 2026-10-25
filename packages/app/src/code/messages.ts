/**
 * The messages between the app and its code worker (ADR 0054). The app hands over the project, the
 * approved packages and what the open view shows; the worker answers with what changed, a little at a
 * time, so that the app always knows it is alive and which package it is running.
 */
import type {
  ComputedAttribute,
  Drawing,
  HookName,
  Problem,
  ProjectSnapshot,
} from '@visual-anything/core';
import type { Capability, Id } from '@visual-anything/schema';

/** A package whose code the person approved, to run. */
export interface RunPackage {
  package: Id;
  name: string;
  hash: string;
  /** The module's text. */
  code: string;
  /** The capabilities granted to it. */
  granted: Capability[];
  /** How many of its calls stopped in a row before this, as the app counts them. */
  stops: number;
}

/** What the app asks of the worker. */
export type CodeRequest =
  /** The project as it is now. */
  | { kind: 'project'; project: ProjectSnapshot }
  /** The packages to run: every other one is unloaded. */
  | { kind: 'packages'; packages: RunPackage[] }
  /** The view drawn, the scale it is drawn at and the elements it shows, for `draw`. */
  | { kind: 'view'; view: Id | undefined; scale: number; shown: Id[] };

/** A computed attribute, with the package whose code computed it. */
export interface ComputedValue extends ComputedAttribute {
  package: Id;
}

/** What package code answered for one element, from every package that runs on it. */
export interface ElementAnswers {
  element: Id;
  /** Computed values, the nearest package's first, one per name. */
  attributes: ComputedValue[];
  /** What `check` found, and what went wrong running the code on it. */
  problems: Problem[];
  /** What to draw inside its shapes, from the nearest package that draws. */
  drawing?: Drawing;
}

/** Where a package's code stands in the worker. */
export interface PackageRun {
  package: Id;
  /** Running; failed to load; or turned off after its calls stopped too many times in a row. */
  state: 'running' | 'failed' | 'off';
  hooks: HookName[];
  /** Why it failed or is off, or the last thing that went wrong while it runs. */
  problem?: Problem;
  /** How many of its calls stopped in a row. */
  stops: number;
}

/** What the worker tells the app. */
export type CodeReply =
  | {
      kind: 'answers';
      /** The package whose code runs now, when the worker is at work. */
      calling?: Id;
      /** The elements whose answers changed. */
      elements: ElementAnswers[];
      /** The elements that no longer have any answer. */
      cleared: Id[];
      /** The packages whose state changed. */
      packages: PackageRun[];
    }
  /** Everything asked for is done. */
  | { kind: 'idle' };
