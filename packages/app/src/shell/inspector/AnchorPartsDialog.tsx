import {
  anchoringCommand,
  componentOrEssence,
  crosswalksOf,
  planAnchoring,
  planSolidAnchoring,
  solidAnchoringCommand,
  type AnchorMatching,
  type AnchorPlan,
  type AnchorRequest,
  type ProjectSnapshot,
  type SolidAnchorPlan,
} from '@visual-anything/core';
import { ESSENCE_ID, type Element, type Id, type ViewFile } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useModalFocus } from '../../canvas/focus';
import { useEditor } from '../../editor/EditorContext';
import { useT, type PluralText } from '../../i18n';
import { byPackage } from './describe';
import './named-parts.css';

const MATCHED: PluralText = {
  one: '{count} part is matched to a content:',
  other: '{count} parts are matched to contents:',
};
const CREATED: PluralText = {
  one: '{count} part gets an element of its own:',
  other: '{count} parts get an element of their own:',
};
const UNMATCHED: PluralText = {
  one: '{count} part matches nothing.',
  other: '{count} parts match nothing.',
};
const KEPT: PluralText = {
  one: '{count} part is drawn as a content already, and keeps it.',
  other: '{count} parts are drawn as contents already, and keep them.',
};
const ANCHOR: PluralText = { one: 'Anchor {count} part', other: 'Anchor {count} parts' };
const MORE: PluralText = { one: '…and {count} more.', other: '…and {count} more.' };

/** How many matches the dialog lists of each kind before it says how many more there are. */
const LISTED = 8;

type By = AnchorMatching['by'];

/** A plan of any drawing's parts, an SVG image's or a solid's, as the dialog shows it. */
type Plan = AnchorPlan | SolidAnchorPlan;

/** A planned part's id: an SVG part's id, or a solid part's name, which is its id. */
function partIdOf(part: { readonly id: string } | { readonly name: string }): string {
  return 'id' in part ? part.id : part.name;
}

/**
 * Anchor parts… (ADR 0067, ADR 0075): matches the parts of a drawing's picture, or of the solid it
 * shows, to its contents by name, by id or by an external identifier in a scheme the person picks,
 * translated through the crosswalks of the project's packages, and optionally creates an element of a
 * chosen component for each part that matches nothing. It shows what it would do as the choices
 * change, with the core's own plan, and applies it as one undoable action. Modal: the focus stays
 * inside it until it closes.
 */
export function AnchorPartsDialog({
  drawing,
  view,
  of = 'image',
  onClose,
}: {
  drawing: Element;
  view: ViewFile | undefined;
  /** Whose parts: the SVG image the drawing shows, or its solid. */
  of?: 'image' | 'solid';
  onClose: () => void;
}) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const titleId = useId();
  const schemeId = useId();
  const createId = useId();
  const componentId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLInputElement>(null);
  useModalFocus(dialog);
  useEffect(() => first.current?.focus(), []);

  const schemes = useMemo(() => schemesIn(project), [project]);
  const [by, setBy] = useState<By>('name');
  const [scheme, setScheme] = useState(schemes[0] ?? '');
  const [create, setCreate] = useState(false);
  const offered = byPackage(definitions.components, project.packages);
  const [component, setComponent] = useState<Id>(() => defaultComponent(project, drawing, offered));
  const [busy, setBusy] = useState(false);

  const planning = useMemo(() => {
    const matching: AnchorMatching =
      by === 'external' ? { by: 'external', scheme: scheme.trim() } : { by };
    if (matching.by === 'external' && matching.scheme === '') return undefined;
    const request: AnchorRequest = {
      drawing: drawing.id,
      matching,
      ...(view === undefined ? {} : { view: view.id }),
      ...(create && component !== '' ? { create: { component } } : {}),
    };
    return of === 'solid' ? planSolidAnchoring(project, request) : planAnchoring(project, request);
  }, [project, drawing.id, view, by, scheme, create, component, of]);
  const plan: Plan | undefined = planning?.ok ? planning.plan : undefined;
  const nameOf = (id: Id) => t.definition(id, componentOrEssence(definitions, id).name);

  const apply = async () => {
    const command =
      plan && ('solid' in plan ? solidAnchoringCommand(plan) : anchoringCommand(plan));
    if (!command || !send) return;
    setBusy(true);
    try {
      const result = await send(command);
      if (result.ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialog}
        className="dialog anchor-parts"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2 id={titleId}>{t('Anchor the parts of “{name}”', { name: drawing.name })}</h2>
        <fieldset className="anchor-parts-by">
          <legend>{t('Match each part')}</legend>
          {(
            [
              ['name', t('By name, to a content named alike')],
              ['id', t('By id, to the element with that id')],
              ['external', t('By an external identifier, read in a scheme')],
            ] as const
          ).map(([value, label], at) => (
            <label key={value}>
              <input
                ref={at === 0 ? first : undefined}
                type="radio"
                name={`${titleId}-by`}
                value={value}
                checked={by === value}
                onChange={() => setBy(value)}
              />
              {label}
            </label>
          ))}
          {by === 'external' && (
            <div className="anchor-parts-scheme">
              <label htmlFor={schemeId}>{t('Scheme')}</label>
              <input
                id={schemeId}
                list={`${schemeId}-known`}
                value={scheme}
                spellCheck={false}
                onChange={(event) => setScheme(event.target.value)}
              />
              <datalist id={`${schemeId}-known`}>
                {schemes.map((each) => (
                  <option key={each} value={each} />
                ))}
              </datalist>
              <p className="dialog-note">
                {t(
                  'A part’s id is read as an identifier as it is, or with its first “_” as “:”; the crosswalks of the project’s packages translate it when contents use another scheme.',
                )}
              </p>
            </div>
          )}
        </fieldset>
        <div className="anchor-parts-create">
          <input
            id={createId}
            type="checkbox"
            checked={create}
            onChange={(event) => setCreate(event.target.checked)}
          />
          <label htmlFor={createId}>
            {t('Create an element for each part that matches nothing, named after the part')}
          </label>
          {create && (
            <>
              <label htmlFor={componentId}>{t('Component')}</label>
              <select
                id={componentId}
                value={component}
                onChange={(event) => setComponent(event.target.value)}
              >
                {offered.map((from) => (
                  <optgroup key={from.id} label={t.definition(from.id, from.name)}>
                    {from.members.map((id) => (
                      <option key={id} value={id}>
                        {nameOf(id)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="anchor-parts-plan" aria-live="polite">
          {planning && !planning.ok && (
            <p className="inspector-problem" role="alert">
              {t.message(planning.problem.message)}
            </p>
          )}
          {plan && <PlanSummary plan={plan} />}
        </div>
        <p className="dialog-note">{t('You can undo this.')}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="dialog-confirm"
            disabled={!plan || plan.anchors === 0 || busy || send === undefined}
            onClick={() => void apply()}
          >
            {t(ANCHOR, { count: plan?.anchors ?? 0 })}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What a plan would do: the parts it matches and creates, those it keeps and those left. */
function PlanSummary({ plan }: { plan: Plan }) {
  const t = useT();
  const matched: string[] = [];
  const created: string[] = [];
  let kept = 0;
  let unmatched = 0;
  for (const { part, anchor } of plan.parts) {
    if (anchor.kind === 'matched') {
      matched.push(t('“{part}” → “{name}”', { part: partIdOf(part), name: anchor.element.name }));
    } else if (anchor.kind === 'created') {
      created.push(t('“{part}” → a new “{name}”', { part: partIdOf(part), name: anchor.name }));
    } else if (anchor.kind === 'kept') kept += 1;
    else unmatched += 1;
  }
  return (
    <>
      {matched.length > 0 && (
        <section>
          <p>{t(MATCHED, { count: matched.length })}</p>
          <Listed items={matched} />
        </section>
      )}
      {created.length > 0 && (
        <section>
          <p>{t(CREATED, { count: created.length })}</p>
          <Listed items={created} />
        </section>
      )}
      {kept > 0 && <p>{t(KEPT, { count: kept })}</p>}
      {unmatched > 0 && <p>{t(UNMATCHED, { count: unmatched })}</p>}
      {plan.anchors === 0 && <p>{t('Nothing would be anchored.')}</p>}
    </>
  );
}

function Listed({ items }: { items: readonly string[] }) {
  const t = useT();
  return (
    <ul className="anchor-parts-list">
      {items.slice(0, LISTED).map((item) => (
        <li key={item}>{item}</li>
      ))}
      {items.length > LISTED && <li>{t(MORE, { count: items.length - LISTED })}</li>}
    </ul>
  );
}

/** The schemes the project's elements and its packages' crosswalks use, sorted. */
function schemesIn(project: ProjectSnapshot): string[] {
  const schemes = new Set<string>();
  for (const element of project.model.elements) {
    for (const scheme of Object.keys(element.ids ?? {})) schemes.add(scheme);
  }
  for (const table of crosswalksOf(project)) {
    schemes.add(table.from);
    schemes.add(table.to);
  }
  return [...schemes].sort();
}

/**
 * The component a created element is of at first: that of the drawing's contents drawn as parts, or
 * of its first content, or else the first component offered other than Essence.
 */
function defaultComponent(
  project: ProjectSnapshot,
  drawing: Element,
  offered: readonly { members: readonly Id[] }[],
): Id {
  const contents = new Set(
    project.model.relations.filter((each) => each.to === drawing.id).map((each) => each.from),
  );
  const content =
    project.model.elements.find(
      (each) => contents.has(each.id) && each.appearance?.part !== undefined,
    ) ?? project.model.elements.find((each) => contents.has(each.id));
  if (content) return content.component;
  const all = offered.flatMap((each) => each.members);
  return all.find((id) => id !== ESSENCE_ID) ?? all[0] ?? '';
}
