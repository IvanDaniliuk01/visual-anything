import { useEffect, useRef, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { ComponentEditor } from './ComponentEditor';
import { DeriveForm } from './DeriveForm';
import { backToSelection } from './focus';
import { NewPackageForm } from './NewPackageForm';
import { openedKey, useOpenDefinition } from './opened';
import { PackageEditor } from './PackageEditor';
import { RelationTypeEditor } from './RelationTypeEditor';
import './definitions.css';

/**
 * The inspector's content: the component editor or one of its forms while one is open, with "Back to
 * the selection", and otherwise `children`, what the inspector shows of the selection. The inspector
 * wraps its content in it.
 */
export function DefinitionInspector({ children }: { children?: ReactNode }) {
  const t = useT();
  const { opened, focusRequest, close } = useOpenDefinition();
  const title = useRef<HTMLHeadingElement>(null);

  // An opening that asks for the focus moves it to the title of what it shows, once.
  useEffect(() => {
    if (focusRequest > 0) title.current?.focus();
  }, [focusRequest]);

  if (opened === undefined) return <>{children}</>;
  return (
    <div className="definition-inspector">
      <button
        type="button"
        className="inspector-action definition-back"
        onClick={(event) => backToSelection(event.currentTarget, close)}
      >
        {t('Back to the selection')}
      </button>
      <div key={openedKey(opened)}>
        {opened.kind === 'component' && <ComponentEditor id={opened.id} titleRef={title} />}
        {opened.kind === 'relation-type' && <RelationTypeEditor id={opened.id} titleRef={title} />}
        {opened.kind === 'package' && <PackageEditor id={opened.id} titleRef={title} />}
        {opened.kind === 'derive' && (
          <DeriveForm of={opened.of} base={opened.base} useFor={opened.useFor} titleRef={title} />
        )}
        {opened.kind === 'new-package' && <NewPackageForm titleRef={title} />}
      </div>
    </div>
  );
}
