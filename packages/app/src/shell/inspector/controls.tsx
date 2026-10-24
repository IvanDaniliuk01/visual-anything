/**
 * The inspector's controls. Each one changes the project with one command, and so one undoable
 * action: text when it is committed with Enter or by leaving it, and selects, checkboxes and colours on
 * `change`. Until the project shows the result, a control shows what was chosen; then it shows the
 * project's value again, which after a refusal is the value it had.
 */
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

/** What every control takes. */
interface ControlProps {
  id: string;
  disabled: boolean;
  /** The ids of what describes the control, separated by spaces. */
  describedBy?: string | undefined;
  /** Each new request, a number above zero, moves the focus to the control. */
  focusRequest?: number;
}

/** Makes a commit, whose refusal the live session already shows as a notice. */
async function attempt(commit: () => Promise<unknown>): Promise<void> {
  try {
    await commit();
  } catch {
    // The control goes back to the project's value, as after a refusal.
  }
}

/** Moves the focus to a control on each new request. */
function useFocusRequest(control: RefObject<HTMLElement | null>, request: number): void {
  useEffect(() => {
    if (request > 0) control.current?.focus();
  }, [control, request]);
}

/** Joins the ids of what describes a control, leaving out those that are absent. */
function describedByOf(...ids: (string | undefined)[]): string | undefined {
  const present = ids.filter((id) => id !== undefined && id !== '');
  return present.length > 0 ? present.join(' ') : undefined;
}

interface TextControlProps extends ControlProps {
  /** The project's value, as text. */
  value: string;
  /** Several lines: Enter still commits, and Shift+Enter starts a new line. */
  multiline?: boolean;
  /** `number` asks for a number. */
  inputType?: 'text' | 'number';
  /** Why typed text cannot be committed; the control then keeps it and says why. */
  problemOf?: (text: string) => string | undefined;
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
  value,
  multiline = false,
  inputType = 'text',
  problemOf,
  onCommit,
}: TextControlProps) {
  const [draft, setDraft] = useState<TextDraft>();
  const control = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useFocusRequest(control, focusRequest);
  const problemId = `${id}-problem`;
  const problem = draft?.problem;

  const save = async (text: string) => {
    await attempt(() => onCommit(text));
    setDraft((current) => (current?.saving && current.text === text ? undefined : current));
  };

  const commit = () => {
    if (!draft || draft.saving) return;
    const { text } = draft;
    if (text === value) {
      setDraft(undefined);
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
    onKeyDown: (event: KeyboardEvent) => {
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
      {problem !== undefined && (
        <p id={problemId} className="inspector-problem">
          {problem}
        </p>
      )}
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
  checked,
  onCommit,
}: CheckboxControlProps) {
  const [pending, setPending] = useState<boolean>();
  const control = useRef<HTMLInputElement>(null);
  useFocusRequest(control, focusRequest);

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

/** A select, committed when another option is chosen. */
export function SelectControl({
  id,
  disabled,
  describedBy,
  focusRequest = 0,
  value,
  labelledBy,
  onCommit,
  children,
}: SelectControlProps) {
  const [pending, setPending] = useState<string>();
  const control = useRef<HTMLSelectElement>(null);
  useFocusRequest(control, focusRequest);
  const shown = pending ?? value;

  const save = async (next: string) => {
    setPending(next);
    await attempt(() => onCommit(next));
    setPending((current) => (current === next ? undefined : current));
  };

  return (
    <select
      ref={control}
      id={id}
      value={shown}
      disabled={disabled}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onChange={(event) => {
        if (event.target.value !== shown) void save(event.target.value);
      }}
    >
      {children}
    </select>
  );
}

interface ColorControlProps extends ControlProps {
  /** The project's colour, as `#rrggbb`. */
  value: string;
  onCommit: (color: string) => Promise<unknown>;
}

/**
 * A colour, committed when the browser says it was chosen: on the input's `change` event, which React
 * does not tell apart from `input` for colours, so the control listens for it itself. While the picker
 * is open, the swatch shows what it points at. The colour is also written out next to its swatch.
 */
export function ColorControl({
  id,
  disabled,
  describedBy,
  focusRequest = 0,
  value,
  onCommit,
}: ColorControlProps) {
  const [draft, setDraft] = useState<string>();
  const control = useRef<HTMLInputElement>(null);
  useFocusRequest(control, focusRequest);
  const shown = (draft ?? value).toLowerCase();
  const writtenId = `${id}-written`;

  const chosen = useEffectEvent((color: string) => {
    if (color.toLowerCase() === value.toLowerCase()) {
      setDraft(undefined);
      return;
    }
    setDraft(color);
    void (async () => {
      await attempt(() => onCommit(color));
      setDraft((current) => (current === color ? undefined : current));
    })();
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

  return (
    <span className="inspector-color">
      <input
        ref={control}
        id={id}
        type="color"
        value={shown}
        disabled={disabled}
        aria-describedby={describedByOf(writtenId, describedBy)}
        onChange={(event) => setDraft(event.target.value)}
      />
      <span id={writtenId} className="inspector-color-written">
        {shown}
      </span>
    </span>
  );
}
