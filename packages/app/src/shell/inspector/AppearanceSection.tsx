import {
  appearanceOf,
  detailText,
  type AppearanceChanges,
  type Definitions,
  type ModelIndex,
  type UpdateElementCommand,
} from '@visual-anything/core';
import type { Element } from '@visual-anything/schema';
import { useId, useState, type ReactNode } from 'react';
import { ColorControl, SelectControl } from './controls';
import { detailOf } from './detail';
import { Detail, Mark } from './parts';
import { SHAPES, isShape } from './shapes';

interface AppearanceSectionProps {
  element: Element;
  index: ModelIndex;
  definitions: Definitions;
  disabled: boolean;
  /** Changes the element with one command; resolves to whether it was done. */
  update: (changes: UpdateElementCommand['changes']) => Promise<boolean>;
}

/**
 * How the element is drawn: what its own appearance sets, which is a particularity, and its
 * component's appearance for the rest, with what its shapes write under its name. Each change sends
 * only the trait it changes, so it never undoes a change to another trait made meanwhile, here or by
 * Claude.
 */
export function AppearanceSection({
  element,
  index,
  definitions,
  disabled,
  update,
}: AppearanceSectionProps) {
  const headingId = useId();
  const [focusShape, setFocusShape] = useState(0);
  const own = element.appearance ?? {};
  const shown = appearanceOf(element, definitions);
  const ownTraits = Object.entries(own).filter(([, value]) => value !== undefined);
  const parts = detailOf(element, index, definitions);
  const written = detailText(parts.filter((part) => part.kind !== 'badge'));
  const badges = parts.filter((part) => part.kind === 'badge').map((part) => part.text);

  const change = (traits: AppearanceChanges) => update({ appearanceTraits: traits });

  const reset = async () => {
    // The button goes with the element's own appearance: the focus moves to the first trait.
    if (await update({ appearance: null })) setFocusShape((request) => request + 1);
  };

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>Appearance</h4>
      <ul className="inspector-appearance" aria-labelledby={headingId}>
        <Trait label="Shape" own={own.shape !== undefined}>
          {(id, describedBy) => (
            <SelectControl
              id={id}
              value={shown.shape}
              disabled={disabled}
              describedBy={describedBy}
              focusRequest={focusShape}
              onCommit={async (shape) => {
                if (isShape(shape)) await change({ shape });
              }}
            >
              {SHAPES.map(({ shape, name }) => (
                <option key={shape} value={shape}>
                  {name}
                </option>
              ))}
            </SelectControl>
          )}
        </Trait>
        <Trait label="Fill" own={own.fill !== undefined}>
          {(id, describedBy) => (
            <ColorControl
              id={id}
              label="Fill"
              value={shown.fill}
              disabled={disabled}
              describedBy={describedBy}
              onCommit={(fill) => change({ fill })}
            />
          )}
        </Trait>
        <Trait label="Stroke" own={own.stroke !== undefined}>
          {(id, describedBy) => (
            <ColorControl
              id={id}
              label="Stroke"
              value={shown.stroke}
              disabled={disabled}
              describedBy={describedBy}
              onCommit={(stroke) => change({ stroke })}
            />
          )}
        </Trait>
      </ul>
      {(own.width !== undefined || own.height !== undefined) && (
        <p className="inspector-notes">
          It also sets its own size: {own.width ?? shown.width} by {own.height ?? shown.height}.
        </p>
      )}
      <dl className="details inspector-detail">
        <Detail term="Detail">{written === '' ? 'Nothing under its name' : written}</Detail>
        {badges.length > 0 && <Detail term="Badges">{badges.join(', ')}</Detail>}
      </dl>
      {ownTraits.length > 0 && (
        <button
          type="button"
          className="inspector-action"
          disabled={disabled}
          onClick={() => void reset()}
        >
          Use the component’s appearance
        </button>
      )}
    </section>
  );
}

interface TraitProps {
  label: string;
  /** Whether the element's own appearance sets this trait, which makes it a particularity. */
  own: boolean;
  /** The control, given its id and what describes it. */
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** One trait of the appearance: its label, its control and, when it is the element's own, its mark. */
function Trait({ label, own, children }: TraitProps) {
  const id = useId();
  const markId = useId();
  return (
    <li className="inspector-trait">
      <label htmlFor={id}>{label}</label>
      <span className="inspector-trait-control">{children(id, own ? markId : undefined)}</span>
      {own && <Mark id={markId} reason="its own" />}
    </li>
  );
}
