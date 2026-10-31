/**
 * One thread whole (ADR 0059): what it is about, which selects it; its comments, each with who wrote
 * it and when, one's own with Edit; a reply; Resolve or Reopen; and Delete, after a question. Each
 * change is one action.
 */
import { isDetached, isSameAuthor } from '@visual-anything/core';
import type { CommentFile, PersonAuthor, ThreadComment } from '@visual-anything/schema';
import { useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import { actionTime, useToday } from '../history/time';
import { useT } from '../i18n';
import { BackIcon } from '../shell/icons';
import { aboutText, authorText } from './about';
import { CommentText } from './CommentText';
import { Composer } from './Composer';
import { deleteThreadCommand, editCommand, replyCommand, resolveCommand } from './commands';
import { useAnchorSelect } from './navigation';
import { useComments } from './store';

interface ThreadViewProps {
  thread: CommentFile;
  /** The person as their comments name them; absent until they give a name. */
  me: PersonAuthor | undefined;
}

export function ThreadView({ thread, me }: ThreadViewProps) {
  const t = useT();
  const { project, send } = useEditor();
  const [store] = useComments();
  const { selectAnchor, selectMention } = useAnchorSelect();
  const [editing, setEditing] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const detached = isDetached(project, thread);
  const resolved = thread.resolved === true;
  const about = aboutText(t, project, thread.anchor);
  const blocked = me === undefined ? t('Give your name above to comment.') : undefined;

  const run = async (command: Parameters<NonNullable<typeof send>>[0]) =>
    send === undefined ? false : (await send(command)).ok;

  return (
    <section className="comment-thread" aria-label={t('Thread: {about}', { about })}>
      <button type="button" className="comment-back" onClick={() => store.openThread(undefined)}>
        <BackIcon size={14} />
        {t('All threads')}
      </button>
      <h3 className="comment-thread-title">
        {detached ? (
          about
        ) : (
          <button
            type="button"
            className="comment-about"
            title={t('Select what the thread is about')}
            onClick={() => selectAnchor(thread.anchor)}
          >
            {about}
          </button>
        )}
      </h3>
      {resolved && <p className="comment-state">{t('Resolved')}</p>}
      {detached && (
        <p className="comment-hint">
          {t(
            'What this thread is about was deleted. The thread is kept: undoing the deletion brings it back.',
          )}
        </p>
      )}
      <ol className="comment-list">
        {thread.comments.map((comment) => (
          <li key={comment.id} className="comment">
            <CommentHeader comment={comment} />
            {editing === comment.id ? (
              <Composer
                label={t('Edit your comment')}
                submit={t('Save')}
                initial={comment.text}
                autoFocus
                onCancel={() => setEditing(undefined)}
                onSubmit={async (text) => {
                  if (me === undefined) return false;
                  const done = await run(editCommand(thread.id, comment.id, text, me));
                  if (done) setEditing(undefined);
                  return done;
                }}
              />
            ) : (
              <>
                <CommentText text={comment.text} onMention={selectMention} />
                {send !== undefined && me !== undefined && isSameAuthor(comment.author, me) && (
                  <button
                    type="button"
                    className="comment-button comment-button-small"
                    onClick={() => setEditing(comment.id)}
                  >
                    {t('Edit')}
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
      {send !== undefined && (
        <>
          <Composer
            label={t('Reply')}
            submit={resolved ? t('Reply and reopen') : t('Reply')}
            blocked={blocked}
            onSubmit={(text) =>
              me === undefined ? Promise.resolve(false) : run(replyCommand(thread.id, text, me))
            }
          />
          <div className="comment-actions">
            <button
              type="button"
              className="comment-button"
              onClick={() => void run(resolveCommand(thread.id, !resolved))}
            >
              {resolved ? t('Reopen') : t('Resolve')}
            </button>
            <button
              type="button"
              className="comment-button comment-button-danger"
              onClick={() => setDeleting(true)}
            >
              {t('Delete thread…')}
            </button>
          </div>
        </>
      )}
      {deleting && (
        <div className="comment-confirm" role="alertdialog" aria-label={t('Delete the thread?')}>
          <p>
            {t(
              {
                one: 'Delete this thread and its {count} comment? You can undo it.',
                other: 'Delete this thread and its {count} comments? You can undo it.',
              },
              { count: thread.comments.length },
            )}
          </p>
          <div className="comment-actions">
            <button
              type="button"
              className="comment-button comment-button-danger"
              // The question opens for answering it.
              autoFocus
              onClick={() => {
                void run(deleteThreadCommand(thread.id)).then((done) => {
                  if (done) store.openThread(undefined);
                });
              }}
            >
              {t('Delete thread')}
            </button>
            <button type="button" className="comment-button" onClick={() => setDeleting(false)}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function CommentHeader({ comment }: { comment: ThreadComment }) {
  const t = useT();
  const today = useToday();
  const time = Date.parse(comment.time);
  const edited = comment.edited === undefined ? undefined : Date.parse(comment.edited);
  return (
    <p className="comment-header">
      <span
        className={
          comment.author.kind === 'claude' ? 'comment-author comment-claude' : 'comment-author'
        }
      >
        {authorText(t, comment.author)}
      </span>{' '}
      <time dateTime={comment.time}>{actionTime(time, today, t.language)}</time>
      {edited !== undefined && (
        <span className="comment-edited">
          {' '}
          {t('(edited {time})', { time: actionTime(edited, today, t.language) })}
        </span>
      )}
    </p>
  );
}
