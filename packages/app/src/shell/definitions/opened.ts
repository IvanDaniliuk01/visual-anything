/**
 * Which definition the inspector shows in the component editor, in place of the selection: a
 * component, a relation type or a package, or a form that derives or defines one. The element and
 * relation inspectors and the Components tab open one; selecting anything on the canvas or in the
 * outline closes it, since it stays open only while the selection it was opened over stays.
 */
import type { Id } from '@visual-anything/schema';
import { createContext, useContext, useSyncExternalStore } from 'react';
import { useEditor } from '../../editor/EditorContext';
import type { Selection } from '../../editor/selection';
import type { DefinitionKind } from './commands';

/** A component, relation type or package the component editor shows. */
export interface DefinitionTarget {
  kind: DefinitionKind | 'package';
  id: Id;
}

/** A form the inspector shows in place of the selection. */
export type DefinitionForm =
  /**
   * Derives a component or relation type from `base`; Essence or "relates to" defines a new one. From
   * an element or a relation, it offers to use the new definition for it.
   */
  | { kind: 'derive'; of: DefinitionKind; base: Id; useFor?: Id }
  /** Creates a package of the project's own. */
  | { kind: 'new-package' };

/** What the inspector shows in place of the selection. */
export type Opened = DefinitionTarget | DefinitionForm;

/** An opening: what, over which selection, and whether it takes the focus. */
export interface Opening {
  opened: Opened;
  over: Selection;
  focus: boolean;
  /** Counts the openings, so that each one that takes the focus moves it once. */
  serial: number;
}

/** Keeps what the inspector shows in place of the selection, for the open project. */
export class DefinitionStore {
  private opening: Opening | undefined;
  private serial = 0;
  private readonly listeners = new Set<() => void>();

  get = (): Opening | undefined => this.opening;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Shows a definition or a form while `over` stays the selection. */
  open(opened: Opened, over: Selection, focus: boolean): void {
    this.serial += 1;
    this.opening = { opened, over, focus, serial: this.serial };
    this.notify();
  }

  /** Shows the selection again. */
  close(): void {
    if (this.opening === undefined) return;
    this.opening = undefined;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/** The store of the open project, which the shell provides with `DefinitionProvider`. */
export const DefinitionContext = createContext<DefinitionStore | undefined>(undefined);

/** What the inspector shows in place of the selection, and how to change it. */
export interface OpenDefinition {
  /** The definition or form shown in place of the selection; `undefined` while the selection shows. */
  opened: Opened | undefined;
  /** Each opening that takes the focus, a number above zero; zero for one that leaves it. */
  focusRequest: number;
  /**
   * Shows a definition or a form in the inspector; `focus` moves the focus to it, as from a button
   * that goes with what the inspector showed. Absent where no inspector can show one.
   */
  open: ((opened: Opened, options?: { focus?: boolean }) => void) | undefined;
  /** Shows the selection again. */
  close: () => void;
}

const nothing = () => undefined;
const noSubscription = () => () => {};

/** What the inspector shows in place of the selection, for components inside the shell. */
export function useOpenDefinition(): OpenDefinition {
  const store = useContext(DefinitionContext);
  const { selection } = useEditor();
  const opening = useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    store?.get ?? nothing,
    store?.get ?? nothing,
  );
  const current = opening !== undefined && opening.over === selection ? opening : undefined;
  return {
    opened: current?.opened,
    focusRequest: current?.focus === true ? current.serial : 0,
    open:
      store === undefined
        ? undefined
        : (opened, options) => store.open(opened, selection, options?.focus ?? false),
    close: () => store?.close(),
  };
}

/** A key for what is open, to tell which tree row stands for it and when it changes. */
export function openedKey(opened: Opened | undefined): string | undefined {
  if (opened === undefined) return undefined;
  switch (opened.kind) {
    case 'derive':
      return `derive:${opened.of}:${opened.base}:${opened.useFor ?? ''}`;
    case 'new-package':
      return 'new-package';
    default:
      return `${opened.kind}:${opened.id}`;
  }
}
