import { useId, useState, type FormEvent, type Ref } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { InlineProblem } from '../inspector/controls';
import { Title } from '../inspector/parts';
import { packageIdProblem, proposedPackageId } from './commands';
import { useOpenDefinition } from './opened';
import { useSender } from './useSender';

/**
 * Creates a package of the project's own: its name, and an id made from it that the form shows and
 * that can be changed, checked against the built-in packages, the ids Visual Anything keeps for
 * packages it plans to build in, and every id the project holds. Then the package shows.
 */
export function NewPackageForm({ titleRef }: { titleRef: Ref<HTMLHeadingElement> }) {
  const { project, send } = useEditor();
  const { open } = useOpenDefinition();
  const sender = useSender();
  const nameId = useId();
  const idId = useId();
  const descriptionId = useId();
  const problemId = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Undefined while the id follows the name.
  const [id, setId] = useState<string>();
  const shownId = id ?? proposedPackageId(project, name);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') {
      sender.refuse('Give the package a name.');
      return;
    }
    const problem = packageIdProblem(project, shownId);
    if (problem !== undefined) {
      sender.refuse(problem);
      return;
    }
    const done = await sender.send({
      type: 'create-package',
      package: {
        id: shownId,
        name: name.trim(),
        ...(description.trim() === '' ? {} : { description }),
      },
    });
    if (done) open?.({ kind: 'package', id: shownId }, { focus: true });
  };

  return (
    <form
      className="definition-form"
      aria-label="New package"
      onSubmit={(event) => void submit(event)}
    >
      <Title titleRef={titleRef} name="New package" />
      <div className="inspector-control">
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          type="text"
          value={name}
          aria-describedby={sender.problem === undefined ? undefined : problemId}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={idId}>Id</label>
        <input
          id={idId}
          type="text"
          value={shownId}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setId(event.target.value)}
        />
      </div>
      <div className="inspector-control">
        <label htmlFor={descriptionId}>Description</label>
        <textarea
          id={descriptionId}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      {sender.problem !== undefined && <InlineProblem id={problemId} text={sender.problem} />}
      <div className="definition-actions">
        <button type="submit" className="inspector-action" disabled={send === undefined}>
          Create the package
        </button>
      </div>
    </form>
  );
}
