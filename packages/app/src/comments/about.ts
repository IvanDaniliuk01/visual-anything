/**
 * What a thread is about, in the words the comments panel and the pins use, in the language the app
 * reads in; names are as people wrote them.
 */
import { modelIndexOf, relationLabel, type ProjectSnapshot } from '@visual-anything/core';
import type { CommentAnchor } from '@visual-anything/schema';
import type { Translator } from '../i18n';

export function aboutText(t: Translator, project: ProjectSnapshot, anchor: CommentAnchor): string {
  const index = modelIndexOf(project);
  const view = (id: string) => project.views.find((each) => each.id === id)?.name;
  switch (anchor.kind) {
    case 'element': {
      const name = index.element(anchor.element)?.name;
      return name ?? t('“{id}”, deleted', { id: anchor.element });
    }
    case 'relation':
      return index.relation(anchor.relation)
        ? relationLabel(index, anchor.relation)
        : t('“{id}”, deleted', { id: anchor.relation });
    case 'view': {
      const name = view(anchor.view);
      return name === undefined
        ? t('The view “{id}”, deleted', { id: anchor.view })
        : t('The view “{name}”', { name });
    }
    case 'point': {
      const name = view(anchor.view);
      return name === undefined
        ? t('A point of the view “{id}”, deleted', { id: anchor.view })
        : t('A point of “{name}”', { name });
    }
  }
}
