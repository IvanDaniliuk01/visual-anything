/**
 * The inspector's sheet: an element read rather than edited. Its description and every attribute that
 * has a value, whole, each under its name with its definition's description as a hint; an attribute
 * whose definition has "format": "emphasis" draws its value as Markdown blocks, as a description does
 * (lists, tables, headings, code), any other text as written. Packages' panels follow it, so that a
 * project's own reading of the element shows without scrolling past the editing sections.
 *
 * Whether the inspector shows the sheet or the editing sections is each person's, kept in the browser,
 * and holds from one element to the next.
 */
import type { AttributeDefinition, Attributes } from '@visual-anything/schema';
import { useT } from '../../i18n';
import { EmphasisBlocks } from '../../text/EmphasisText';
import { attributeRows, jsonText } from './attributes';
import type { InspectorMode } from './inspectorMode';

/** The two buttons that switch the inspector between the sheet and editing. */
export function InspectorModeSwitch({
  mode,
  onChange,
}: {
  mode: InspectorMode;
  onChange: (mode: InspectorMode) => void;
}) {
  const t = useT();
  return (
    <div className="inspector-mode" role="group" aria-label={t('Show the element as')}>
      <button type="button" aria-pressed={mode === 'sheet'} onClick={() => onChange('sheet')}>
        {t('Sheet')}
      </button>
      <button type="button" aria-pressed={mode === 'edit'} onClick={() => onChange('edit')}>
        {t('Edit')}
      </button>
    </div>
  );
}

interface ReadSheetProps {
  description: string | undefined;
  definitions: readonly AttributeDefinition[];
  values: Attributes | undefined;
}

/** The element's description and its attributes with a value, read. */
export function ReadSheet({ description, definitions, values }: ReadSheetProps) {
  const t = useT();
  const rows = attributeRows(definitions, values).filter(
    (row) => row.value !== undefined && row.value !== null && row.value !== '',
  );
  return (
    <section className="inspector-section inspector-sheet">
      {description !== undefined && description.trim() !== '' && (
        <EmphasisBlocks text={description} headingLevel={5} />
      )}
      {rows.length === 0 ? (
        <p className="panel-empty">{t('No attribute has a value.')}</p>
      ) : (
        <dl>
          {rows.map((row) => (
            <div key={row.name} className="inspector-sheet-row">
              <dt title={row.definition?.description}>{row.name}</dt>
              <dd>
                {typeof row.value === 'string' ? (
                  row.definition?.format === 'emphasis' ? (
                    <EmphasisBlocks text={row.value} headingLevel={6} />
                  ) : (
                    <span className="inspector-sheet-text">{row.value}</span>
                  )
                ) : (
                  <span className="inspector-sheet-text">
                    {typeof row.value === 'number' || typeof row.value === 'boolean'
                      ? String(row.value)
                      : jsonText(row.value as never)}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
