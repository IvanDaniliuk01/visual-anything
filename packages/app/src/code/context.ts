/**
 * Package code as the panels and the canvas read it (ADR 0054): every package that holds code, where
 * it stands with the person's approvals and in the worker, what it answered for each element, and the
 * way to review, approve and withdraw an approval.
 *
 * The shell keeps it in a store whose identity never changes, carried by the editor's context, so
 * that what the worker answers re-renders only the components that read it.
 */
import {
  notApprovedProblem,
  turnedOffProblem,
  type CodeStatus,
  type Drawing,
  type PackageCode,
} from '@visual-anything/core';
import type { Capability, Id } from '@visual-anything/schema';
import { useContext, useSyncExternalStore } from 'react';
import { EditorContext } from '../editor/EditorContext';
import type { PackageCalls } from './client';
import type { ElementAnswers, PackageAnswer, PackageRun } from './messages';

/** A package that holds code, with where it stands. */
export interface PackageCodeView {
  code: PackageCode;
  /** Approved or not, by the person's preferences. */
  status: CodeStatus;
  /** What the worker says of it, once it runs. */
  run?: PackageRun;
  /**
   * Whether the person turned its code off on this computer (ADR 0089's M14.2 clarification): it
   * stays in the project, approved or not, and the worker is never asked to load it.
   */
  turnedOff?: true;
}

/** What package code stands at and answered, at one moment. */
export interface CodeState {
  /** Every package of the project that holds code, by id. */
  packages: ReadonlyMap<Id, PackageCodeView>;
  /** What the approved code answered for each element. */
  elements: ReadonlyMap<Id, ElementAnswers>;
  /** What it draws inside each element's shapes. */
  drawings: ReadonlyMap<Id, Drawing>;
  /** The package whose code the approval dialog shows, while it is open. */
  reviewing?: Id;
  /** The hash its code had when the dialog opened, to say when it changed under the person. */
  reviewedHash?: string;
}

/** What the person does with package code. */
export interface CodeActions {
  /** Opens the dialog that shows a package's code and asks to approve it; undefined closes it. */
  review: (pkg: Id | undefined) => void;
  /**
   * Approves the code the person reviewed, by the hash it had and with the capabilities shown, those
   * granted among them; false, approving nothing, when the package's code is another by now.
   */
  approve: (
    pkg: Id,
    reviewed: string,
    shown: readonly Capability[],
    granted: readonly Capability[],
  ) => boolean;
  /** Withdraws the approval of a package's code as it is now: it stops running. */
  withdraw: (pkg: Id) => void;
  /**
   * Turns a package's code off on this computer, or on again, as the person's preference (ADR 0089):
   * while it is off, its hooks never run, whatever its approval.
   */
  turnOff: (pkg: Id, off: boolean) => void;
}

/** How approving, withdrawing and turning code off are done, which change the person's preferences. */
type KeptActions = Omit<CodeActions, 'review' | 'turnOff'> & Partial<Pick<CodeActions, 'turnOff'>>;

export type CodeContextValue = CodeState & CodeActions;

export const NO_CODE: CodeState = Object.freeze({
  packages: new Map(),
  elements: new Map(),
  drawings: new Map(),
});

/** The store of package code the shell keeps for the open project. */
export class CodeStore {
  private state: CodeState = NO_CODE;
  private readonly listeners = new Set<() => void>();
  private kept: KeptActions = { approve: () => false, withdraw: () => {} };
  /** The host of the code worker, lent while the shell is mounted. */
  private host: PackageCalls | undefined;
  /**
   * How the app runs what package code adds to it (ADR 0089): through the code worker's host while
   * one is lent; without one, as where no approved code runs, each call answers that the package's
   * code is not approved.
   */
  readonly calls: PackageCalls = {
    runPackageAction: (pkg, input) =>
      this.turnedOff(pkg) ?? this.host?.runPackageAction(pkg, input) ?? this.notRunning(pkg),
    readFileWithPackage: (pkg, input) =>
      this.turnedOff(pkg) ?? this.host?.readFileWithPackage(pkg, input) ?? this.notRunning(pkg),
    writeFileWithPackage: (pkg, input) =>
      this.turnedOff(pkg) ?? this.host?.writeFileWithPackage(pkg, input) ?? this.notRunning(pkg),
    packagePanel: (pkg, input) =>
      this.turnedOff(pkg) ?? this.host?.packagePanel(pkg, input) ?? this.notRunning(pkg),
  };
  readonly actions: CodeActions = {
    review: (pkg) => this.review(pkg),
    approve: (pkg, reviewed, shown, granted) => this.kept.approve(pkg, reviewed, shown, granted),
    withdraw: (pkg) => this.kept.withdraw(pkg),
    turnOff: (pkg, off) => this.kept.turnOff?.(pkg, off),
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly snapshot = (): CodeState => this.state;

  /** What package code stands at and answered now; the dialog stays as it is. */
  set(state: Omit<CodeState, 'reviewing' | 'reviewedHash'>): void {
    if (
      state.packages === this.state.packages &&
      state.elements === this.state.elements &&
      state.drawings === this.state.drawings
    ) {
      return;
    }
    const { reviewing, reviewedHash } = this.state;
    this.change({
      packages: state.packages,
      elements: state.elements,
      drawings: state.drawings,
      ...(reviewing === undefined ? {} : { reviewing }),
      ...(reviewedHash === undefined ? {} : { reviewedHash }),
    });
  }

  /** How approving, withdrawing and turning code off are done, which change the person's preferences. */
  setActions(actions: KeptActions): void {
    this.kept = actions;
  }

  /** Lends the code worker's host, or none, to {@link calls}; answers how to take it back. */
  lendCalls(host: PackageCalls | undefined): () => void {
    this.host = host;
    return () => {
      if (this.host === host) this.host = undefined;
    };
  }

  /** That a package's code is turned off on this computer, for a call of it; nothing otherwise. */
  private turnedOff<T>(pkg: Id): Promise<PackageAnswer<T>> | undefined {
    const view = this.state.packages.get(pkg);
    if (view?.turnedOff !== true) return undefined;
    const named = { id: pkg, name: view.code.name };
    return Promise.resolve({ ok: false, problem: turnedOffProblem(named) });
  }

  private notRunning<T>(pkg: Id): Promise<PackageAnswer<T>> {
    const name = this.state.packages.get(pkg)?.code.name ?? pkg;
    return Promise.resolve({ ok: false, problem: notApprovedProblem({ id: pkg, name }) });
  }

  private review(pkg: Id | undefined): void {
    if (pkg === this.state.reviewing) return;
    const { packages, elements, drawings } = this.state;
    const hash = pkg === undefined ? undefined : packages.get(pkg)?.code.hash;
    this.change({
      packages,
      elements,
      drawings,
      ...(pkg === undefined ? {} : { reviewing: pkg }),
      ...(hash === undefined ? {} : { reviewedHash: hash }),
    });
  }

  private change(state: CodeState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}

const NO_SUBSCRIPTION = (): (() => void) => () => {};
const noCode = (): CodeState => NO_CODE;

/** The store the editor carries, if any. */
function useStore(): CodeStore | undefined {
  return useContext(EditorContext)?.code;
}

/** Package code, for components inside the shell; null where the editor carries none. */
export function useCode(): CodeContextValue | null {
  const store = useStore();
  const state = useSyncExternalStore(
    store?.subscribe ?? NO_SUBSCRIPTION,
    store?.snapshot ?? noCode,
    noCode,
  );
  if (!store) return null;
  return { ...state, ...store.actions };
}

/**
 * How the app runs what package code adds to it (ADR 0089), for the menus, Import…, Export… and the
 * inspector: null where the editor carries no store. Its functions never change.
 */
export function usePackageCalls(): PackageCalls | null {
  return useStore()?.calls ?? null;
}

/** What package code draws inside shapes, by element: none where the editor carries no store. */
export function useCodeDrawings(): ReadonlyMap<Id, Drawing> {
  const store = useStore();
  return useSyncExternalStore(
    store?.subscribe ?? NO_SUBSCRIPTION,
    store?.snapshot ?? noCode,
    noCode,
  ).drawings;
}
