/**
 * The inspector's controls. Each one changes the project with one command, and so one undoable
 * action: text when it is committed with Enter or by leaving it, checkboxes and colors on `change`,
 * and selects when an option is picked from the list, or, when the arrow keys go through a closed
 * select, with Enter or by leaving it. Until the project shows the result, a control shows what was
 * chosen; then it shows the project's value again, which after a refusal is the value it had. What is
 * committed while an earlier commit is on its way is compared with that one, not with the value the
 * project still shows.
 */
import { sameColor } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { COLOR_FORMS, readColor } from '../../color';
import { useT } from '../../i18n';
import { EmphasisPreview } from '../../text/EmphasisText';
import { useEmphasisKeys } from '../../text/useEmphasisKeys';
import type { FocusKeeper } from './focus';
import { useColorChoices } from './useColorChoices';

/** What every control takes. */
interface ControlProps {
  id: string;
  disabled: boolean;
  /** The ids of what describes the control, separated by spaces. */
  describedBy?: string | undefined;
  /** Each new request, a number above zero, moves the focus to the control. */
  focusRequest?: number;
  /** Called once the control took the focus for a request, so that the request can be dropped. */
  onFocused?: () => void;
  /** Hands the focus on to the control that takes this one's place, such as for a value of another type. */
  focusKeeper?: FocusKeeper | undefined;
}

/** Makes a commit, whose refusal the live session already shows as a notice. */
async function attempt(commit: () => Promise<unknown>): Promise<void> {
  try {
    await commit();
  } catch {
    // The control goes back to the project's value, as after a refusal.
  }
}

/**
 * Moves the focus to a control on each new request, and says so. The focus keeper hands the focus on
 * from a control that goes to this one; the cleanup runs before the control leaves the document, while
 * it can still have the focus.
 */
function useFocus(
  control: RefObject<HTMLElement | null>,
  request: number,
  onFocused: (() => void) | undefined,
  keeper: FocusKeeper | undefined,
): void {
  const focused = useEffectEvent(() => onFocused?.());
  useEffect(() => {
    if (request <= 0) return;
    control.current?.focus();
    focused();
  }, [control, request]);
  useLayoutEffect(() => {
    const element = control.current;
    if (keeper?.take()) element?.focus();
    return () => {
      if (element && element === element.ownerDocument.activeElement) keeper?.leave();
    };
  }, [control, keeper]);
}

/** Joins the ids of what describes a control, leaving out those that are absent. */
function describedByOf(...ids: (string | undefined)[]): string | undefined {
  const present = ids.filter((id) => id !== undefined && id !== '');
  return present.length > 0 ? present.join(' ') : undefined;
}

/**
 * Why what was typed cannot be committed. It appears without the focus moving, so it is an alert:
 * screen readers say it as it appears.
 */
export function InlineProblem({
  id,
  text,
  inline = false,
}: {
  id: string;
  text: string;
  inline?: boolean;
}) {
  const Tag = inline ? 'span' : 'p';
  return (
    <Tag id={id} role="alert" className="inspector-problem">
      {text}
    </Tag>
  );
}

interface TextControlProps extends ControlProps {
  /** The project's value, as text. */
  value: string;
  /** Several lines: Enter still commits, and Shift+Enter starts a new line. */
  multiline?: boolean;
  /**
   * Whether the text takes text emphasis (ADR 0082): the keys that wrap the selection in markers,
   * and the text drawn under the field when it differs from its source. A text of several lines
   * also takes Markdown's blocks.
   */
  emphasis?: boolean;
  /** `number` asks for a number. */
  inputType?: 'text' | 'number';
  /** Why typed text cannot be committed; the control then keeps it and says why. */
  problemOf?: (text: string) => string | undefined;
  /**
   * Whether two texts stand for the same value, so that committing one in place of the other sends
   * nothing; texts that are equal always do.
   */
  same?: (a: string, b: string) => boolean;
  /** Commits text that differs from the value; resolves once the project shows the result. */
  onCommit: (text: string) => Promise<unknown>;
}

type TextDraft = { text: string; saving: boolean; problem?: string };

/** A text box: Enter or leaving it commits what was typed, and Escape cancels it. */
export function TextControl({
  id,
  disabled,
  describedBy,
  focusRequest = 0,
  onFocused,
  focusKeeper,
  value,
  multiline = false,
  emphasis = false,
  inputType = 'text',
  problemOf,
  same,
  onCommit,
}: TextControlProps) {
  const [draft, setDraft] = useState<TextDraft>();
  // The text last sent, until its answer comes.
  const sent = useRef<string | undefined>(undefined);
  const control = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useFocus(control, focusRequest, onFocused, focusKeeper);
  const keys = useEmphasisKeys();
  const problemId = `${id}-problem`;
  const problem = draft?.problem;

  const save = async (text: string) => {
    sent.current = text;
    await attempt(() => onCommit(text));
    if (sent.current === text) sent.current = undefined;
    setDraft((current) => (current?.saving && current.text === text ? undefined : current));
  };

  const commit = () => {
    if (!draft || draft.saving) return;
    const { text } = draft;
    const base = sent.current ?? value;
    if (text === base || same?.(text, base) === true) {
      // Nothing changes: the control shows the project's value, or the text on its way to it.
      setDraft(sent.current === undefined ? undefined : { text: sent.current, saving: true });
      return;
    }
    const reason = problemOf?.(text);
    if (reason !== undefined) {
      setDraft({ text, saving: false, problem: reason });
      return;
    }
    setDraft({ text, saving: true });
    void save(text);
  };

  const common = {
    ref: control,
    id,
    value: draft?.text ?? value,
    disabled,
    'aria-describedby': describedByOf(describedBy, problem === undefined ? undefined : problemId),
    'aria-invalid': problem === undefined ? undefined : true,
    onChange: (event: { target: { value: string } }) => {
      setDraft({ text: event.target.value, saving: false });
    },
    onBlur: commit,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (emphasis && keys.onKeyDown(event, (text) => setDraft({ text, saving: false }))) return;
      if (event.key === 'Escape') {
        setDraft(undefined);
      } else if (
        event.key === 'Enter' &&
        !(multiline && event.shiftKey) &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        commit();
      }
    },
  };

  return (
    <>
      {multiline ? (
        <textarea {...common} rows={3} />
      ) : (
        <input {...common} type={inputType} step={inputType === 'number' ? 'any' : undefined} />
      )}
      {problem !== undefined && <InlineProblem id={problemId} text={problem} />}
      {emphasis && <EmphasisPreview text={draft?.text ?? value} blocks={multiline} />}
    </>
  );
}

interface CheckboxControlProps extends ControlProps {
  checked: boolean;
  onCommit: (checked: boolean) => Promise<unknown>;
}

/** A checkbox, committed when it is checked or unchecked. */
export function CheckboxControl({
  id,
  disabled,
  describedBy,
  focusRequest = 0,
  onFocused,
  focusKeeper,
  checked,
  onCommit,
}: CheckboxControlProps) {
  const [pending, setPending] = useState<boolean>();
  const control = useRef<HTMLInputElement>(null);
  useFocus(control, focusRequest, onFocused, focusKeeper);

  const save = async (next: boolean) => {
    setPending(next);
    await attempt(() => onCommit(next));
    setPending((current) => (current === next ? undefined : current));
  };

  return (
    <input
      ref={control}
      id={id}
      type="checkbox"
      checked={pending ?? checked}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={(event) => void save(event.target.checked)}
    />
  );
}

interface SelectControlProps extends ControlProps {
  value: string;
  /** Names the select by what labels it, when it has no label of its own. */
  labelledBy?: string;
  onCommit: (value: string) => Promise<unknown>;
  /** The options. */
  children: ReactNode;
}

/**
 * Whether a key goes through the options of a closed select, as the arrow keys, Home, End, the page
 * keys and typing a letter do on Windows and Linux; with Alt, an arrow opens the list instead.
 */
function browsesOptions(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  return (
    /^(Arrow(Up|Down|Left|Right)|Home|End|Page(Up|Down))$/.test(event.key) ||
    (event.key.length === 1 && event.key !== ' ')
  );
}

/**
 * A select. An option picked from the list is committed at once; an option the keys reach in a closed
 * select only shows, and is committed with Enter or by leaving the select, so that going through the
 * options sends one command, not one for each key. Escape goes back to the project's value.
 */
export function SelectControl({
  id,
  disabled,
  describedBy,
  focusRequest = 0,
  onFocused,
  focusKeeper,
  value,
  labelledBy,
  onCommit,
  children,
}: SelectControlProps) {
  // What was sent and waits for its answer, and an option the keys reached that is not sent yet.
  const [pending, setPending] = useState<string>();
  const [reached, setReached] = useState<string>();
  const sent = useRef<string | undefined>(undefined);
  // Set by a key that goes through the options, until the change it makes, which comes in the same task.
  const browsing = useRef(false);
  const control = useRef<HTMLSelectElement>(null);
  useFocus(control, focusRequest, onFocused, focusKeeper);
  const shown = reached ?? pending ?? value;

  const save = async (next: string) => {
    sent.current = next;
    setPending(next);
    await attempt(() => onCommit(next));
    if (sent.current === next) sent.current = undefined;
    setPending((current) => (current === next ? undefined : current));
  };

  const commit = (next: string) => {
    setReached(undefined);
    if (next !== (sent.current ?? value)) void save(next);
  };

  return (
    <select
      ref={control}
      id={id}
      value={shown}
      disabled={disabled}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && reached !== undefined) {
          event.preventDefault();
          commit(reached);
        } else if (event.key === 'Escape' && reached !== undefined) {
          event.preventDefault();
          setReached(undefined);
        } else if (browsesOptions(event)) {
          browsing.current = true;
          setTimeout(() => {
            browsing.current = false;
          }, 0);
        }
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (browsing.current) {
          browsing.current = false;
          setReached(next);
        } else if (next !== shown) {
          commit(next);
        }
      }}
      onBlur={() => {
        if (reached !== undefined) commit(reached);
      }}
    >
      {children}
    </select>
  );
}

interface ColorControlProps extends ControlProps {
  /** What the color is for, such as "Fill": the code box and the swatches are named after it. */
  label: string;
  /** The color shown, as `#RRGGBB`; for shapes whose colors differ, the first of them. */
  value: Color;
  /** Whether the shapes the control changes show different colors: it then says "Mixed". */
  mixed?: boolean;
  /**
   * The color the canvas draws for `value`, when it draws another: on the dark canvas with the
   * project's stored colors adapted (ADR 0087). It shows beside the stored color, which is what a
   * pick changes.
   */
  drawn?: Color;
  /**
   * Commits a color, in capitals, that differs from the one shown; resolves once the project shows it,
   * to `false` when it was not done. A color that was done goes first among the recent colors.
   * `waiting` says that an earlier commit of this control has not been answered yet, so that the
   * project does not show it yet: the command must then not be left out because the project shows
   * the color picked.
   */
  onCommit: (color: Color, pick: { waiting: boolean }) => Promise<unknown>;
}

/**
 * A color, chosen with the browser's picker, from the swatches of recent and project colors, or written
 * as a code, such as #F3F5F8. The picker commits when the browser says a color was chosen: on the
 * input's `change` event, which React does not tell apart from `input` for colors, so the control
 * listens for it itself; while the picker is open, the swatch shows what it points at. The code commits
 * with Enter or by leaving it, and Escape cancels it. The color shown is never sent again.
 */
export function ColorControl({
  id,
  disabled,
  describedBy,
  focusRequest = 0,
  onFocused,
  focusKeeper,
  label,
  value,
  mixed = false,
  drawn,
  onCommit,
}: ColorControlProps) {
  const t = useT();
  const [draft, setDraft] = useState<Color>();
  const [code, setCode] = useState<{ text: string; problem?: string }>();
  // The color last sent, until its answer comes.
  const sent = useRef<Color | undefined>(undefined);
  const control = useRef<HTMLInputElement>(null);
  useFocus(control, focusRequest, onFocused, focusKeeper);
  const { suggestions, remember } = useColorChoices();
  const shown = (draft ?? readColor(value) ?? value).toUpperCase();
  const isMixed = mixed && draft === undefined;
  const codeId = `${id}-code`;
  const problemId = `${id}-code-problem`;
  const mixedId = `${id}-mixed`;
  const drawnId = `${id}-drawn`;
  const drawnShown =
    drawn !== undefined && !isMixed && draft === undefined && !sameColor(drawn, value)
      ? drawn.toUpperCase()
      : undefined;

  const choose = (picked: string) => {
    const color = readColor(picked);
    if (color === undefined) return;
    const base = sent.current ?? (mixed ? undefined : value);
    if (base !== undefined && sameColor(color, base)) {
      setDraft(sent.current);
      return;
    }
    const waiting = sent.current !== undefined;
    sent.current = color;
    setDraft(color);
    void (async () => {
      // A refusal the live session already shows as a notice; the control shows the project's value.
      const done = await onCommit(color, { waiting }).then(
        (result) => result !== false,
        () => false,
      );
      if (done) remember(color);
      if (sent.current === color) sent.current = undefined;
      setDraft((current) => (current === color ? undefined : current));
    })();
  };

  const chosen = useEffectEvent((color: string) => {
    choose(color);
  });

  useEffect(() => {
    const input = control.current;
    if (!input) return;
    const listener = () => {
      chosen(input.value);
    };
    input.addEventListener('change', listener);
    return () => {
      input.removeEventListener('change', listener);
    };
  }, []);

  const commitCode = () => {
    if (!code) return;
    const color = readColor(code.text);
    if (color === undefined) {
      setCode({ text: code.text, problem: t(COLOR_FORMS) });
      return;
    }
    setCode(undefined);
    choose(color);
  };

  return (
    <span className={isMixed ? 'inspector-color is-mixed' : 'inspector-color'}>
      <span className="inspector-color-swatch">
        <input
          ref={control}
          id={id}
          type="color"
          value={shown.toLowerCase()}
          disabled={disabled}
          aria-describedby={describedByOf(
            describedBy,
            isMixed ? mixedId : drawnShown !== undefined ? drawnId : undefined,
          )}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
        />
        {isMixed && (
          <span id={mixedId} className="inspector-color-mixed">
            {t('Mixed')}
          </span>
        )}
      </span>
      <input
        id={codeId}
        type="text"
        className="inspector-color-code"
        value={code?.text ?? (isMixed ? '' : shown)}
        placeholder={isMixed ? t('Mixed') : undefined}
        disabled={disabled}
        aria-label={t('{label} color code', { label })}
        aria-describedby={describedByOf(code?.problem === undefined ? undefined : problemId)}
        aria-invalid={code?.problem === undefined ? undefined : true}
        spellCheck={false}
        autoComplete="off"
        maxLength={24}
        onChange={(event) => setCode({ text: event.target.value })}
        onBlur={commitCode}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setCode(undefined);
          } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commitCode();
          }
        }}
      />
      {code?.problem !== undefined && <InlineProblem id={problemId} text={code.problem} inline />}
      {drawnShown !== undefined && (
        <span id={drawnId} className="inspector-color-drawn">
          <span
            className="inspector-color-drawn-swatch"
            style={{ backgroundColor: drawnShown }}
            aria-hidden="true"
          />
          {t('Drawn {color} on the dark canvas', { color: drawnShown })}
        </span>
      )}
      {suggestions.length > 0 && (
        <Swatches
          label={label}
          colors={suggestions}
          disabled={disabled}
          onPick={(color) => choose(color)}
        />
      )}
    </span>
  );
}

interface SwatchesProps {
  label: string;
  colors: readonly Color[];
  disabled: boolean;
  onPick: (color: Color) => void;
}

/**
 * The colors offered for a trait, as buttons named like "Use #DCEBFF": one Tab stop, and the arrow
 * keys, Home and End move between them. No `<datalist>`, which Firefox does not show for colors.
 */
function Swatches({ label, colors, disabled, onPick }: SwatchesProps) {
  const t = useT();
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.min(active, colors.length - 1);

  const move = (event: KeyboardEvent, at: number) => {
    const last = colors.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? Math.min(at + 1, last)
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? Math.max(at - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  };

  return (
    <span
      role="group"
      className="inspector-swatches"
      aria-label={t('Recent and project colors for {label}', { label: label.toLowerCase() })}
    >
      {colors.map((color, at) => (
        <button
          key={color}
          ref={(button) => {
            buttons.current[at] = button;
          }}
          type="button"
          className="inspector-swatch"
          style={{ backgroundColor: color }}
          tabIndex={at === current ? 0 : -1}
          disabled={disabled}
          aria-label={t('Use {color}', { color })}
          title={color}
          onFocus={() => setActive(at)}
          onKeyDown={(event) => move(event, at)}
          onClick={() => onPick(color)}
        />
      ))}
    </span>
  );
}
