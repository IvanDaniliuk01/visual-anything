import type { Command, UpdateRelationTypeCommand } from '@visual-anything/core';
import type { Id, LimitList } from '@visual-anything/schema';
import { useId, useState } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { CheckboxControl, SelectControl } from '../inspector/controls';
import { TraitRow, type TraitControl } from './TraitRow';
import { inheritedRelationType, nameOf, namesOr, relationTypeSources, sourceText } from './traits';

type Limits = NonNullable<UpdateRelationTypeCommand['changes']['limits']>;
type End = 'from' | 'to';

interface LimitsSectionProps {
  id: Id;
  readOnly: boolean;
  update: (limits: Limits) => Command;
}

/**
 * What the ends of a relation type's relations may be created from, end by end: what it inherits,
 * any component or relation type, or only those chosen. Breaking a limit only warns.
 */
export function LimitsSection({ id, readOnly, update }: LimitsSectionProps) {
  const t = useT();
  const headingId = useId();
  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Limits')}</h4>
      <ul className="definition-traits">
        <LimitRow end="from" id={id} readOnly={readOnly} update={update} />
        <LimitRow end="to" id={id} readOnly={readOnly} update={update} />
      </ul>
    </section>
  );
}

interface LimitRowProps extends LimitsSectionProps {
  end: End;
}

function LimitRow({ end, id, readOnly, update }: LimitRowProps) {
  const t = useT();
  const { definitions } = useEditor();
  const [choosing, setChoosing] = useState(false);
  const own = definitions.relationTypes.get(id)?.definition.limits?.[end];
  const inherited = inheritedRelationType(definitions, id).limits[end];
  const source = relationTypeSources(definitions, id)[`limits.${end}`];
  const mode = own === undefined ? (choosing ? 'list' : 'inherit') : own === 'any' ? 'any' : 'list';
  const either = (other: Id) =>
    definitions.components.has(other)
      ? nameOf(definitions, 'component', other)
      : nameOf(definitions, 'relation-type', other);
  const inheritedText =
    inherited === undefined
      ? t('Inherited (any)')
      : t('Inherited ({names})', { names: namesOr(inherited.map(either)) });

  return (
    <TraitRow
      label={end === 'from' ? t('From end') : t('To end')}
      source={sourceText(definitions, 'relation-type', id, source)}
      own={own !== undefined}
      readOnly={readOnly}
    >
      {(control) => (
        <>
          <SelectControl
            id={control.id}
            value={mode}
            disabled={readOnly}
            describedBy={control.describedBy}
            onCommit={async (next) => {
              if (next === 'inherit') {
                setChoosing(false);
                if (own !== undefined) await control.send(update({ [end]: null }));
              } else if (next === 'any') {
                setChoosing(false);
                await control.send(update({ [end]: 'any' }));
              } else if (inherited !== undefined && own === undefined) {
                // Its own list starts as the one it inherits.
                await control.send(update({ [end]: [...inherited] }));
              } else {
                setChoosing(true);
              }
            }}
          >
            <option value="inherit">{inheritedText}</option>
            <option value="any">{t('Any')}</option>
            <option value="list">{t('Only these…')}</option>
          </SelectControl>
          {mode === 'list' && (
            <Choices
              end={end}
              chosen={Array.isArray(own) ? own : []}
              readOnly={readOnly}
              control={control}
              update={update}
            />
          )}
        </>
      )}
    </TraitRow>
  );
}

interface ChoicesProps {
  end: End;
  chosen: LimitList;
  readOnly: boolean;
  control: TraitControl;
  update: (limits: Limits) => Command;
}

/** The components and relation types in use an end may be created from, as a checklist. */
function Choices({ end, chosen, readOnly, control, update }: ChoicesProps) {
  const t = useT();
  const { definitions } = useEditor();
  const componentsId = useId();
  const relationTypesId = useId();
  const write = (next: Id[]) => control.send(update({ [end]: next }));
  const toggle = (other: Id, checked: boolean) =>
    write(checked ? [...chosen, other] : chosen.filter((each) => each !== other));
  const groups = [
    {
      headingId: componentsId,
      title: t('Components'),
      ids: [...definitions.components.keys()],
      kind: 'component' as const,
    },
    {
      headingId: relationTypesId,
      title: t('Relation types'),
      ids: [...definitions.relationTypes.keys()],
      kind: 'relation-type' as const,
    },
  ];
  return (
    <div className="definition-choices">
      {chosen.length === 1 && !readOnly && (
        <p className="inspector-notes">
          {t('The last one stays: choose Any to lift the limit, or the inherited one.')}
        </p>
      )}
      {groups.map((group) => (
        <div key={group.title}>
          <p id={group.headingId} className="inspector-notes">
            {group.title}
          </p>
          <ul className="definition-checklist" aria-labelledby={group.headingId}>
            {group.ids.map((other) => (
              <Choice
                key={other}
                name={nameOf(definitions, group.kind, other)}
                checked={chosen.includes(other)}
                disabled={readOnly || (chosen.length === 1 && chosen[0] === other)}
                onCommit={(checked) => toggle(other, checked)}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Choice({
  name,
  checked,
  disabled,
  onCommit,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onCommit: (checked: boolean) => Promise<unknown>;
}) {
  const id = useId();
  return (
    <li className="definition-checklist-item">
      <CheckboxControl id={id} checked={checked} disabled={disabled} onCommit={onCommit} />
      <label htmlFor={id}>{name}</label>
    </li>
  );
}
