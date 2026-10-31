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
import type { SimulationReply, SimulationRequest } from '../simulation/messages';

/** A package whose code the person approved, to run. */
export interface RunPackage {
  package: Id;
  name: string;
  /** The hash the person approved; the worker loads the code only when it is this code's. */
  hash: string;
  /** The module's text. */
  code: string;
  /** Every capability the package declares, as its file does: with the text, what the hash is of. */
  declared: string[];
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
  | { kind: 'view'; view: Id | undefined; scale: number; shown: Id[] }
  /**
   * What the local program fetched for a package granted an origin (ADR 0063): the origin's answer,
   * or, when there is none, why.
   */
  | { kind: 'fetched'; package: Id; url: string; response?: FetchedResponse; problem?: Problem }
  /** What a simulation run is to do (ADR 0085). */
  | SimulationRequest;

/** What an origin answered a fetch with, as `context.fetched` gives it to package code. */
export interface FetchedResponse {
  status: number;
  text: string;
}

/** An address a package's code wants fetched, and how often, in milliseconds. */
export interface WantedAddress {
  url: string;
  every: number;
}

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
  /**
   * Values `attributes` made of what it fetched through the local program (ADR 0063): live values,
   * which the app sends to the program rather than show as computed, with how long they stay fresh.
   */
  live?: { values: ComputedValue[]; freshFor: number };
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
  | { kind: 'idle' }
  /** Every address a package's code wants fetched now, and how often: the others are no longer. */
  | { kind: 'network'; package: Id; wanted: WantedAddress[] }
  /** What a simulation run did (ADR 0085). */
  | SimulationReply;
