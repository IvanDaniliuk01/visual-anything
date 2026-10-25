import type {
  Command,
  RelationAppearanceChanges,
  UpdateRelationTypeCommand,
} from '@visual-anything/core';
import type { Id, RelationAppearance } from '@visual-anything/schema';
import { useId, type Ref } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import { readNumber } from '../inspector/attributes';
import { SelectControl, TextControl } from '../inspector/controls';
import { Title } from '../inspector/parts';
import { AttributeDefinitionsSection } from './AttributeDefinitionsSection';
import { ColorRow } from './ColorRow';
import { isBuiltInDefinition } from './commands';
import { IdentitySection } from './IdentitySection';
import { LimitsSection } from './LimitsSection';
import { BuiltInNote, Gone, RemoveDefinition } from './parts';
import { TraitRow } from './TraitRow';
import {
  inheritedRelationType,
  lineWidthProblem,
  relationTypeSources,
  sourceText,
  type RelationTrait,
} from './traits';
import { UsedBySection } from './UsedBySection';

type Dash = NonNullable<RelationAppearance['dash']>;

const DASHES: readonly { dash: Dash; name: string }[] = [
  { dash: 'solid', name: 'Solid' },
  { dash: 'dashed', name: 'Dashed' },
  { dash: 'dotted', name: 'Dotted' },
];

function isDash(value: string): value is Dash {
  return DASHES.some((each) => each.dash === value);
}

interface RelationTypeEditorProps {
  id: Id;
  titleRef: Ref<HTMLHeadingElement>;
}

/**
 * The component editor for one relation type: what it is and derives from, its direction and whether
 * it nests, its line, its attributes and its limits, and what uses it. Built-in relation types are
 * read-only and offer to derive one instead.
 */
export function RelationTypeEditor({ id, titleRef }: RelationTypeEditorProps) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const relationType = definitions.relationType(id);
  if (!relationType) {
    return (
      <>
        <Title titleRef={titleRef} name={id} detail={t('Relation type')} />
        <Gone what={t('the relation type “{id}”', { id })} />
      </>
    );
  }
  const builtIn = isBuiltInDefinition(definitions, 'relation-type', id);
  const readOnly = builtIn || send === undefined;
  const update = (changes: UpdateRelationTypeCommand['changes']): Command => ({
    type: 'update-relation-type',
    id,
    changes,
  });
  const packageId = relationType.package;
  const packageName =
    packageId === undefined
      ? undefined
      : t.definition(
          packageId,
          project.packages.find((file) => file.id === packageId)?.name ?? packageId,
        );

  return (
    <>
      <Title
        titleRef={titleRef}
        name={t.definition(id, relationType.name)}
        detail={builtIn ? t('Built-in relation type') : t('Relation type')}
      />
      {builtIn && <BuiltInNote kind="relation-type" id={id} name={relationType.name} />}
      <IdentitySection
        kind="relation-type"
        id={id}
        name={relationType.name}
        description={relationType.description}
        packageName={packageName}
        lineage={relationType.lineage}
        readOnly={readOnly}
        update={(changes) => update(changes)}
      />
      <BehaviorSection id={id} readOnly={readOnly} update={update} />
      <LineSection id={id} readOnly={readOnly} update={(appearance) => update({ appearance })} />
      <AttributeDefinitionsSection
        kind="relation-type"
        id={id}
        readOnly={readOnly}
        update={(attributes) => update({ attributes })}
      />
      <LimitsSection id={id} readOnly={readOnly} update={(limits) => update({ limits })} />
      <UsedBySection kind="relation-type" id={id} />
      {!builtIn && <RemoveDefinition kind="relation-type" id={id} />}
    </>
  );
}

interface SectionProps {
  id: Id;
  readOnly: boolean;
  update: (changes: UpdateRelationTypeCommand['changes']) => Command;
}

/**
 * Its direction and whether it nests, each inherited or set. It cannot stop nesting while a view
 * nests by it, so those choices are disabled, with the views named.
 */
function BehaviorSection({ id, readOnly, update }: SectionProps) {
  const t = useT();
  const { project, definitions } = useEditor();
  const headingId = useId();
  const own = definitions.relationTypes.get(id)?.definition;
  const resolved = definitions.relationType(id);
  const inherited = inheritedRelationType(definitions, id);
  const sources = relationTypeSources(definitions, id);
  const row = (trait: RelationTrait) => ({
    source: sourceText(definitions, 'relation-type', id, sources[trait]),
    readOnly,
  });
  const nestingViews = project.views.filter((view) => view.nestingRelationTypes.includes(id));
  const keepsNesting = resolved?.nests === true && nestingViews.length > 0;
  const viewNames = nestingViews.map((view) => `“${view.name}”`).join(', ');

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Relations')}</h4>
      <ul className="definition-traits">
        <TraitRow label={t('Direction')} own={own?.direction !== undefined} {...row('direction')}>
          {({ id: controlId, describedBy, send }) => (
            <SelectControl
              id={controlId}
              value={own?.direction ?? 'inherit'}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={async (next) => {
                if (next === 'inherit') await send(update({ direction: null }));
                else if (next === 'directed' || next === 'undirected') {
                  await send(update({ direction: next }));
                }
              }}
            >
              <option value="inherit">
                {t('Inherited ({value})', { value: t(inherited.direction) })}
              </option>
              <option value="directed">{t('Directed')}</option>
              <option value="undirected">{t('Undirected')}</option>
            </SelectControl>
          )}
        </TraitRow>
        <TraitRow
          label={t('Nests')}
          own={own?.nests !== undefined}
          {...row('nests')}
          note={
            keepsNesting
              ? t(
                  {
                    one: 'It cannot stop nesting while {views} nests by it.',
                    other: 'It cannot stop nesting while {views} nest by it.',
                  },
                  { views: viewNames, count: nestingViews.length },
                )
              : undefined
          }
        >
          {({ id: controlId, describedBy, send }) => (
            <SelectControl
              id={controlId}
              value={own?.nests === undefined ? 'inherit' : String(own.nests)}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={async (next) => {
                if (next === 'inherit') await send(update({ nests: null }));
                else await send(update({ nests: next === 'true' }));
              }}
            >
              <option value="inherit" disabled={keepsNesting && !inherited.nests}>
                {inherited.nests ? t('Inherited (nests)') : t('Inherited (does not nest)')}
              </option>
              <option value="true">{t('Nests: places its from end inside its to end')}</option>
              <option value="false" disabled={keepsNesting}>
                {t('Does not nest')}
              </option>
            </SelectControl>
          )}
        </TraitRow>
      </ul>
    </section>
  );
}

/** How its relations are drawn: stroke, width and dash, each with where it comes from. */
function LineSection({
  id,
  readOnly,
  update,
}: {
  id: Id;
  readOnly: boolean;
  update: (changes: RelationAppearanceChanges) => Command;
}) {
  const t = useT();
  const { definitions } = useEditor();
  const headingId = useId();
  const shown = definitions.relationType(id)?.appearance;
  if (!shown) return null;
  const sources = relationTypeSources(definitions, id);
  const row = (trait: RelationTrait) => ({
    source: sourceText(definitions, 'relation-type', id, sources[trait]),
    own: sources[trait] === id,
    readOnly,
  });

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Line')}</h4>
      <ul className="definition-traits">
        {/* The color changes at the level the project can change, so a built-in one's too. */}
        <ColorRow kind="relation-type" id={id} trait="stroke" label={t('Stroke')} hints />
        <TraitRow label={t('Line width')} {...row('width')} inherit={() => update({ width: null })}>
          {({ id: controlId, describedBy, send }) => (
            <TextControl
              id={controlId}
              value={String(shown.width)}
              inputType="number"
              disabled={readOnly}
              describedBy={describedBy}
              problemOf={lineWidthProblem}
              onCommit={async (text) => {
                const reading = readNumber(text);
                if (reading.ok) await send(update({ width: reading.value }));
              }}
            />
          )}
        </TraitRow>
        <TraitRow label={t('Dash')} {...row('dash')} inherit={() => update({ dash: null })}>
          {({ id: controlId, describedBy, send }) => (
            <SelectControl
              id={controlId}
              value={shown.dash}
              disabled={readOnly}
              describedBy={describedBy}
              onCommit={async (dash) => {
                if (isDash(dash)) await send(update({ dash }));
              }}
            >
              {DASHES.map(({ dash, name }) => (
                <option key={dash} value={dash}>
                  {t(name)}
                </option>
              ))}
            </SelectControl>
          )}
        </TraitRow>
      </ul>
    </section>
  );
}
