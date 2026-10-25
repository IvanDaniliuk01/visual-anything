/**
 * A comment's text as the panel shows it (ADR 0059): its paragraphs and lists, each part written as
 * text, never as markup, and its mentions as buttons that select what they name, or its id when that
 * is gone.
 */
import {
  modelIndexOf,
  readCommentText,
  relationLabel,
  type CommentInline,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { Fragment, useMemo } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';

interface CommentTextProps {
  text: string;
  /** Selects what a mention names; absent, mentions are only named. */
  onMention?: ((id: Id) => void) | undefined;
}

export function CommentText({ text, onMention }: CommentTextProps) {
  const blocks = useMemo(() => readCommentText(text), [text]);
  return (
    <div className="comment-text">
      {blocks.map((block, at) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={at}>
              {block.lines.map((line, number) => (
                <Fragment key={number}>
                  {number > 0 && <br />}
                  <Line parts={line} onMention={onMention} />
                </Fragment>
              ))}
            </p>
          );
        }
        const items = block.items.map((item, number) => (
          <li key={number}>
            <Line parts={item} onMention={onMention} />
          </li>
        ));
        return block.ordered ? (
          <ol key={at} start={block.start}>
            {items}
          </ol>
        ) : (
          <ul key={at}>{items}</ul>
        );
      })}
    </div>
  );
}

function Line({
  parts,
  onMention,
}: {
  parts: readonly CommentInline[];
  onMention: ((id: Id) => void) | undefined;
}) {
  return parts.map((part, at) =>
    part.kind === 'text' ? (
      <Fragment key={at}>{part.text}</Fragment>
    ) : (
      <Mention key={at} id={part.id} onMention={onMention} />
    ),
  );
}

function Mention({ id, onMention }: { id: Id; onMention: ((id: Id) => void) | undefined }) {
  const t = useT();
  const { project } = useEditor();
  const index = modelIndexOf(project);
  const name =
    index.element(id)?.name ?? (index.relation(id) ? relationLabel(index, id) : undefined);
  if (name === undefined) {
    return (
      <span className="comment-mention comment-mention-gone">{t('“{id}”, deleted', { id })}</span>
    );
  }
  if (onMention === undefined) return <span className="comment-mention">{name}</span>;
  return (
    <button
      type="button"
      className="comment-mention"
      title={t('Select “{name}”', { name })}
      onClick={() => onMention(id)}
    >
      {name}
    </button>
  );
}
