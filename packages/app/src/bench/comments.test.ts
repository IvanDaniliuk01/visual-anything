// @vitest-environment node
import { checkProject } from '@visual-anything/core';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { withCommentThreads } from './comments';
import { syntheticProject } from './synthetic';

describe('withCommentThreads', () => {
  it('gives the benchmark’s project valid threads on its elements, a tenth of them resolved', () => {
    const project = withCommentThreads(syntheticProject({ elements: 1000, overlap: 'none' }), 200);
    expect(project.comments).toHaveLength(200);
    expect(project.comments.filter((thread) => thread.resolved)).toHaveLength(20);
    expect(project.comments.every((thread) => validateFile('comment', thread).ok)).toBe(true);
    expect(checkProject(project).errors).toEqual([]);
  });

  it('leaves the project as it is for no pins', () => {
    const project = syntheticProject({ elements: 10, overlap: 'none' });
    expect(withCommentThreads(project, 0)).toBe(project);
  });
});
