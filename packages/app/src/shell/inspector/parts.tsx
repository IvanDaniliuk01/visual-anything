/** Small parts the inspector's sections share. */
import {
  componentOrEssence,
  relationTypeOrRelatesTo,
  type Definitions,
  type ModelIndex,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { useId, type ReactNode, type Ref } from 'react';
import type { Selectable } from '../../editor/selection';
import { relationLabel } from './describe';

/** One term and its description in a description list. */
export function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="detail">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Secondary text after a name; screen readers hear it after a comma. The space stays outside the
 * hidden comma, since accessible names are computed from each element's text trimmed.
 */
export function Secondary({ className, children }: { className: string; children: ReactNode }) {
  return (
    <>
      <span className="visually-hidden">,</span> <span className={className}>{children}</span>
    </>
  );
}

/** The title of what is inspected: its name, then its component or relation type. */
export function Title({
  titleRef,
  name,
  detail,
}: {
  titleRef?: Ref<HTMLHeadingElement>;
  name: string;
  detail?: string;
}) {
  return (
    <h3 ref={titleRef} className="inspector-title" tabIndex={-1}>
      {name}
      {detail !== undefined && <Secondary className="inspector-title-detail">{detail}</Secondary>}
    </h3>
  );
}

/** Marks a particularity: a trait of this one element. */
export function Mark({ id, reason }: { id: string; reason?: string }) {
  return (
    <span id={id} className="inspector-mark">
      Particularity
      {reason !== undefined && <span className="visually-hidden">: {reason}</span>}
    </span>
  );
}

/** A button that selects an element or a relation. */
export function SelectButton({
  name,
  detail,
  onSelect,
}: {
  name: string;
  detail?: string | undefined;
  onSelect: () => void;
}) {
  return (
    <button type="button" className="inspector-selectable" onClick={onSelect}>
      <span className="inspector-selectable-name">{name}</span>
      {detail !== undefined && (
        <Secondary className="inspector-selectable-detail">{detail}</Secondary>
      )}
    </button>
  );
}

interface EndProps {
  id: Id;
  index: ModelIndex;
  definitions: Definitions;
  onSelect: (item: Selectable) => void;
}

/**
 * An element or a relation, named with its component or relation type, that selects it when clicked.
 * World cannot be selected, and an end that no longer exists is only named.
 */
export function End({ id, index, definitions, onSelect }: EndProps) {
  const element = index.element(id);
  if (element) {
    const component = componentOrEssence(definitions, element.component).name;
    if (element.id === index.world.id) {
      return (
        <span>
          {element.name}
          <Secondary className="inspector-selectable-detail">{component}</Secondary>
        </span>
      );
    }
    return (
      <SelectButton
        name={element.name}
        detail={component}
        onSelect={() => onSelect({ kind: 'element', id })}
      />
    );
  }
  const relation = index.relation(id);
  if (relation) {
    return (
      <SelectButton
        name={relationLabel(index, relation)}
        detail={relationTypeOrRelatesTo(definitions, relation.relationType).name}
        onSelect={() => onSelect({ kind: 'relation', id })}
      />
    );
  }
  return <span>{id}</span>;
}

/**
 * The chain a component or relation type derives from, nearest first; `none` says so when it derives
 * from nothing, as Essence and "relates to" do.
 */
export function Lineage({ names, none }: { names: readonly string[]; none: string }) {
  const term = useId();
  if (names.length === 0) return <p className="inspector-lineage">{none}</p>;
  return (
    <div className="inspector-lineage">
      <span id={term} className="inspector-lineage-term">
        Derives from
      </span>
      <ol aria-labelledby={term}>
        {names.map((name, position) => (
          <li key={`${position}-${name}`}>{name}</li>
        ))}
      </ol>
    </div>
  );
}
