/** Threads of comments kept in the project (ADR 0059): their anchors, authors and text. */
export {
  anchorPhrase,
  anchorTargetOf,
  anchorViewOf,
  detachedThreads,
  isDetached,
  isResolved,
  lastActivityOf,
  threadsAbout,
} from './anchors';
export {
  MAX_AUTHOR_EMAIL,
  MAX_AUTHOR_NAME,
  authorKeyOf,
  authorNameOf,
  checkPerson,
  isSameAuthor,
  type CheckedPerson,
} from './authors';
export {
  MAX_COMMENT_TEXT,
  commentTextProblem,
  mentionsIn,
  normalizeCommentText,
  readCommentText,
  type CommentBlock,
  type CommentInline,
} from './text';
export { MAX_THREAD_COMMENTS } from '../commands/comments';
