/**
 * The canvas toolbar keeps one row (W26): what does not fit goes under More, a button at the row's
 * end that shows it in a panel under it. The groups go in the order `overflow.ts` gives, each moved
 * whole, and come back as the row gets wider. A group under More is the same controls, drawn in the
 * panel through a portal, so they keep their names, states and shortcuts; adding elements and zooming
 * always stay in the row.
 *
 * The keyboard reaches More as any control of the toolbar: Enter or Space opens it, Down opens it and
 * moves into it, Tab goes through its controls, and Escape closes it and gives the focus back to More.
 * A press outside closes it too.
 *
 * The toolbar also says where it ends, as `--canvas-toolbar-bottom` on the canvas area, so that the
 * find field opens below it and never covers the zoom controls or the panel.
 */
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { MoreIcon } from '../shell/icons';
import { useOutsidePress } from './focus';
import {
  MORE_ORDER,
  OVERFLOW_ORDER,
  OverflowPlan,
  groupsUnder,
  isWrapped,
  type OverflowGroup,
} from './overflow';
import './more.css';

/** The custom property, on the canvas area, that says how far down the toolbar reaches. */
export const TOOLBAR_BOTTOM = '--canvas-toolbar-bottom';

/** What of the toolbar's row is not one of its items: the explore strip's own line, the spacer. */
const NOT_IN_ROW = '.explore-strip, .canvas-toolbar-spacer';

const MORE_NAME = 'More of the canvas toolbar';

/** More's own parts, found in the toolbar's element. */
const MORE = '.canvas-toolbar-more';
const MORE_BUTTON = '.canvas-toolbar-more > button';
const MORE_PANEL = '.canvas-toolbar-more-panel';

/**
 * The toolbar's row as it is laid out, and how much of it is under More: a store that React reads,
 * told to look at the row again after each layout and each change of the row's size.
 */
class RowFit {
  readonly #plan = new OverflowPlan();
  readonly #listeners = new Set<() => void>();
  #under = 0;
  #placed: string | undefined;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** How many groups are under More. */
  readonly under = (): number => this.#under;

  /**
   * Looks at the row as it is laid out now: one more group goes under More while it wraps, and one
   * comes back once there is room; and the canvas area learns where the toolbar ends.
   */
  measure(toolbar: HTMLElement): void {
    const items = [...toolbar.children].filter((child) => !child.matches(NOT_IN_ROW));
    const next = this.#plan.next(
      isWrapped(items.map((item) => item.getBoundingClientRect())),
      toolbar.getBoundingClientRect().width,
    );
    this.#place(toolbar);
    if (next === this.#under) return;
    this.#under = next;
    for (const listener of [...this.#listeners]) listener();
  }

  /** Where the toolbar ends, with More's panel while it shows, for the find field. */
  #place(toolbar: HTMLElement): void {
    const area = toolbar.closest<HTMLElement>('.canvas-area');
    if (area === null) return;
    // In a split view, the active pane's toolbar says it, from the top of its canvas, under its
    // header, where the find field shows over it (ADR 0102).
    const pane = toolbar.closest<HTMLElement>('.canvas-pane');
    if (pane !== null && !pane.hasAttribute('data-active')) return;
    const top = (
      pane?.querySelector<HTMLElement>('.canvas-pane-body') ?? area
    ).getBoundingClientRect().top;
    const panel = toolbar.querySelector<HTMLElement>(MORE_PANEL);
    const shown = panel !== null && !panel.hidden ? panel : undefined;
    const bottom = Math.max(
      toolbar.getBoundingClientRect().bottom,
      shown?.getBoundingClientRect().bottom ?? 0,
    );
    const value = `${Math.max(0, Math.round(bottom - top))}px`;
    if (this.#placed === value) return;
    this.#placed = value;
    area.style.setProperty(TOOLBAR_BOTTOM, value);
  }
}

interface Overflow {
  under: ReadonlySet<OverflowGroup>;
  /** Where each group under More is drawn, once the panel has its place for it. */
  slots: Partial<Record<OverflowGroup, HTMLElement>>;
  slotRefs: Record<OverflowGroup, (element: HTMLElement | null) => void>;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const OverflowContext = createContext<Overflow | null>(null);

/**
 * The toolbar's own element, which keeps its row on one line: after each layout and each change of
 * its size, it puts a group under More while the row wraps, and brings one back once there is room.
 */
export function OverflowToolbar({ children, onKeyDown, ...props }: ComponentProps<'div'>) {
  const toolbar = useRef<HTMLDivElement>(null);
  const [fit] = useState(() => new RowFit());
  const count = useSyncExternalStore(fit.subscribe, fit.under);
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Partial<Record<OverflowGroup, HTMLElement>>>({});
  const [slotRefs] = useState(
    () =>
      Object.fromEntries(
        MORE_ORDER.map((group) => [
          group,
          (element: HTMLElement | null) =>
            setSlots((last) =>
              last[group] === (element ?? undefined)
                ? last
                : { ...last, [group]: element ?? undefined },
            ),
        ]),
      ) as Record<OverflowGroup, (element: HTMLElement | null) => void>,
  );

  // After each change of what is under More, and of More itself, until the row settles.
  useLayoutEffect(() => {
    if (toolbar.current !== null) fit.measure(toolbar.current);
  }, [fit, count, open, slots]);

  // A change of the toolbar's size: the canvas got narrower or wider, or a label longer.
  useEffect(() => {
    const element = toolbar.current;
    if (element === null) return;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => fit.measure(element));
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      element.closest<HTMLElement>('.canvas-area')?.style.removeProperty(TOOLBAR_BOTTOM);
    };
  }, [fit]);

  // Nothing under More: there is no panel to keep open.
  if (count === 0 && open) setOpen(false);

  const value = useMemo<Overflow>(
    () => ({ under: groupsUnder(count), slots, slotRefs, open, setOpen }),
    [count, slots, slotRefs, open],
  );

  // Escape anywhere in More closes it, also from a control drawn there through a portal, whose keys
  // reach the toolbar; a control that takes Escape itself, as the filters' panel does, keeps it.
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Escape' || !open) return;
    const more = toolbar.current?.querySelector(MORE);
    if (!(event.target instanceof Node) || !more?.contains(event.target)) return;
    event.preventDefault();
    setOpen(false);
    toolbar.current?.querySelector<HTMLElement>(MORE_BUTTON)?.focus();
  };

  return (
    <OverflowContext value={value}>
      <div
        ref={toolbar}
        {...props}
        // With everything under More, adding elements gives up width and More shows only its icon.
        data-overflow={count === 0 ? undefined : count === OVERFLOW_ORDER.length ? 'all' : 'some'}
        onKeyDown={keyDown}
      >
        {children}
      </div>
    </OverflowContext>
  );
}

/**
 * A part of the toolbar that goes under More, as a group, when the row has no room for it: drawn in
 * place, or in More's panel.
 */
export function Overflowing({ group, children }: { group: OverflowGroup; children: ReactNode }) {
  const overflow = useContext(OverflowContext);
  if (overflow === null || !overflow.under.has(group)) return children;
  const slot = overflow.slots[group];
  return slot === undefined ? null : createPortal(children, slot);
}

/** A button of the toolbar that goes under More with its group. */
export function OverflowButton({
  group,
  ...props
}: ComponentProps<'button'> & { group: OverflowGroup }) {
  return (
    <Overflowing group={group}>
      <button {...props} />
    </Overflowing>
  );
}

/** A group of controls of the toolbar that goes under More whole. */
export function OverflowDiv({ group, ...props }: ComponentProps<'div'> & { group: OverflowGroup }) {
  return (
    <Overflowing group={group}>
      <div {...props} />
    </Overflowing>
  );
}

/** More, at the end of the toolbar's row, while something is under it. */
export function ToolbarMore() {
  const t = useT();
  const overflow = useContext(OverflowContext);
  const panelId = useId();
  const into = useRef(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const setOpen = overflow?.setOpen;
  useOutsidePress(wrapper, () => setOpen?.(false));

  const open = overflow?.open ?? false;
  // Down on More opens it and moves into it.
  useLayoutEffect(() => {
    if (!open || !into.current) return;
    into.current = false;
    firstIn(panel.current)?.focus();
  }, [open]);

  if (overflow === null || overflow.under.size === 0) return null;
  return (
    <span ref={wrapper} className="canvas-toolbar-more">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        title={t(MORE_NAME)}
        onClick={() => overflow.setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          if (open) firstIn(panel.current)?.focus();
          else {
            into.current = true;
            overflow.setOpen(true);
          }
        }}
      >
        <MoreIcon />
        <span className="canvas-toolbar-more-label">{t('More')}</span>
      </button>
      <div
        ref={panel}
        id={panelId}
        className="canvas-toolbar-more-panel"
        role="group"
        aria-label={t(MORE_NAME)}
        hidden={!open}
      >
        {MORE_ORDER.map((group) => (
          <div key={group} ref={overflow.slotRefs[group]} className="canvas-toolbar-more-slot" />
        ))}
      </div>
    </span>
  );
}

/** The first control of More's panel that takes the focus. */
function firstIn(panel: HTMLElement | null): HTMLElement | null | undefined {
  return panel?.querySelector<HTMLElement>(
    'button:not(:disabled), select:not(:disabled), input:not(:disabled)',
  );
}
