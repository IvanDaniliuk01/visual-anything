/**
 * Threads of comments for the app benchmark (ADR 0059): `?pins=200` gives the synthetic project 200
 * open threads on elements spread across it, so that every phase, panning and zooming above all, is
 * measured with their pins following the camera. A third of them are answered by Claude, and every
 * tenth is resolved, which hides its pin.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { CommentFile } from '@visual-anything/schema';

export function withCommentThreads(project: ProjectSnapshot, count: number): ProjectSnapshot {
  const { elements } = project.model;
  if (count <= 0 || elements.length === 0) return project;
  const step = Math.max(1, Math.floor(elements.length / count));
  const threads: CommentFile[] = [];
  for (let at = 0; at < count; at++) {
    const element = elements[(at * step) % elements.length];
    if (!element) break;
    const time = new Date(Date.UTC(2026, 9, 25, 9, 0, at)).toISOString();
    threads.push({
      id: `bench-thread-${at}`,
      anchor: { kind: 'element', element: element.id },
      ...(at % 10 === 9 ? { resolved: true } : {}),
      comments: [
        {
          id: 'question',
          author: { kind: 'person', name: 'Bench' },
          time,
          text: `Is ${element.name} where it should be?`,
        },
        ...(at % 3 === 0
          ? [{ id: 'answer', author: { kind: 'claude' as const }, time, text: 'Yes, it is.' }]
          : []),
      ],
    });
  }
  return { ...project, comments: [...project.comments, ...threads] };
}
