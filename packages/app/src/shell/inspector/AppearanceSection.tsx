import { appearanceOf, type Definitions, type UpdateElementCommand } from '@visual-anything/core';
import type { Appearance, Element } from '@visual-anything/schema';
import { useId, useState, type ReactNode } from 'react';
import { ColorControl, SelectControl } from './controls';
import { Mark } from './parts';

type Shape = NonNullable<Appearance['shape']>;

/** The shapes an element can be drawn as, in the order the inspector offers them. */
const SHAPES: readonly { shape: Shape; name: string }[] = [
  { shape: 'rectangle', name: 'Rectangle' },
  { shape: 'rounded-rectangle', name: 'Rounded rectangle' },
  { shape: 'ellipse', name: 'Ellipse' },
  { shape: 'cylinder', name: 'Cylinder' },
  { shape: 'person', name: 'Person' },
];

function isShape(value: string): value is Shape {
  return SHAPES.some((each) => each.shape === value);
}

interface AppearanceSectionProps {
  element: Element;
  definitions: Definitions;
  disabled: boolean;
  /** Changes the element with one command; resolves to whether it was done. */
  update: (changes: UpdateElementCommand['changes']) => Promise<boolean>;
}

/**
 * How the element is drawn: what its own appearance sets, which is a particularity, and its
 * component's appearance for the rest. Its own appearance is replaced whole, so a change keeps the
 * traits it already sets.
 */
export function AppearanceSection({
  element,
  definitions,
  disabled,
  update,
}: AppearanceSectionProps) {
  const headingId = useId();
  const [focusShape, setFocusShape] = useState(0);
  const own = element.appearance ?? {};
  const shown = appearanceOf(element, definitions);
  const ownTraits = Object.entries(own).filter(([, value]) => value !== undefined);
  const change = (traits: Appearance) => update({ appearance: { ...own, ...traits } });

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
