/**
 * The benchmark's phases with Math (ADR 0106, A9.5), with `?math`: every component the view draws
 * gains a string attribute that takes text emphasis, every element a formula in it, each one distinct
 * (one of `FORMULAS` with the element's index), and every detail shows it, through a project
 * appearance; the view gains `MATH_NOTES` notes, each holding a display block. The same project with
 * plain text in their place, `withMathDetail(project, { math: false })`, is measured first, through the
 * same phases, to read the frames with Math against. Recorded, never held.
 *
 * It also times typesetting distinct formulas (`typesetDistinct`), here in the browser and in Node
 * with `pnpm exec tsx packages/app/src/bench/math-typeset.ts`.
 */
import { typesetMath, type ProjectSnapshot } from '@visual-anything/core';
import type { AttributeDefinition, FreeShape } from '@visual-anything/schema';

/** The attribute every detail shows, which takes text emphasis. */
export const MATH_ATTRIBUTE = 'formula';

/** How many notes with a display block the view gains. */
export const MATH_NOTES = 1_000;

const DEFINITION: AttributeDefinition = {
  name: MATH_ATTRIBUTE,
  type: 'string',
  format: 'emphasis',
  description: 'A formula, for the benchmark.',
};

/** Fifty formulas of the kinds a model explains, short enough to read within a line. */
export const FORMULAS: readonly string[] = [
  String.raw`\frac{a}{b}`,
  String.raw`\sqrt{x^2+y^2}`,
  String.raw`\sum_{i=1}^{n} x_i`,
  String.raw`\int_0^1 f(x)\,dx`,
  String.raw`e^{i\pi} + 1 = 0`,
  String.raw`\sigma(z) = \frac{1}{1 + e^{-z}}`,
  String.raw`\hat y = w^\top x + b`,
  String.raw`\frac{1}{n}\sum_i (y_i - \hat y_i)^2`,
  String.raw`P(A \mid B) = \frac{P(B \mid A)\,P(A)}{P(B)}`,
  String.raw`\mathbb{E}[X] = \sum_x x\,p(x)`,
  String.raw`\operatorname{Var}(X) = \mathbb{E}[X^2] - \mathbb{E}[X]^2`,
  String.raw`\nabla_\theta \mathcal{L}(\theta)`,
  String.raw`\theta \leftarrow \theta - \eta \nabla \mathcal{L}`,
  String.raw`\log p_\theta(x)`,
  String.raw`\binom{n}{k} p^k (1-p)^{n-k}`,
  String.raw`\mathcal{N}(\mu, \sigma^2)`,
  String.raw`\lim_{x \to 0} \frac{\sin x}{x} = 1`,
  String.raw`\alpha + \beta + \gamma = \pi`,
  String.raw`\|w\|_2^2 = \sum_j w_j^2`,
  String.raw`\mathrm{softmax}(z)_i = \frac{e^{z_i}}{\sum_j e^{z_j}}`,
  String.raw`H(p) = -\sum_x p(x) \log p(x)`,
  String.raw`D_{KL}(p \,\|\, q)`,
  String.raw`\arg\max_{c} P(c \mid x)`,
  String.raw`x_{t+1} = A x_t + B u_t`,
  String.raw`\dot x = f(x, u)`,
  String.raw`\frac{\partial f}{\partial x}`,
  String.raw`\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}`,
  String.raw`\prod_{k=1}^{n} k = n!`,
  String.raw`a^2 + b^2 = c^2`,
  String.raw`\vec{F} = m\vec{a}`,
  String.raw`E = mc^2`,
  String.raw`\overline{x} = \frac{1}{n}\sum x_i`,
  String.raw`\tilde{x} \approx x`,
  String.raw`\left( \frac{a}{b} \right)^2`,
  String.raw`\left[ \sum_i x_i \right]`,
  String.raw`\mathbf{A}\mathbf{x} = \mathbf{b}`,
  String.raw`\det(A - \lambda I) = 0`,
  String.raw`\cos^2\theta + \sin^2\theta = 1`,
  String.raw`f(x) = \begin{cases} x & x \ge 0 \\ 0 & x < 0 \end{cases}`,
  String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`,
  String.raw`\mathrm{TP} / (\mathrm{TP} + \mathrm{FP})`,
  String.raw`F_1 = \frac{2PR}{P + R}`,
  String.raw`\sqrt[3]{x}`,
  String.raw`R^2 = 1 - \frac{SS_{res}}{SS_{tot}}`,
  String.raw`\rho_{XY} = \frac{\mathrm{cov}(X,Y)}{\sigma_X \sigma_Y}`,
  String.raw`\lambda \|w\|_1`,
  String.raw`y \sim \mathrm{Bernoulli}(p)`,
  String.raw`\Delta t \le \frac{1}{60}\,\mathrm{s}`,
  String.raw`x \in \mathbb{R}^n`,
  String.raw`\forall \epsilon > 0\; \exists \delta > 0`,
];

/** A distinct formula for an index: one of `FORMULAS`, with the index after it. */
export function formulaAt(at: number): string {
  return `${FORMULAS[at % FORMULAS.length]} \\quad (${at})`;
}

/** The detail an element shows: a formula, or plain text as long as its TeX with `math: false`. */
function detailAt(at: number, math: boolean): string {
  const tex = formulaAt(at);
  return math ? `loss $${tex}$` : `loss ${'x'.repeat(Math.min(40, tex.length))}`;
}

/** A note's text: a line, then a display block, or a second line of plain text with `math: false`. */
function noteAt(at: number, math: boolean): string {
  const tex = formulaAt(at);
  return math ? `Step ${at}:\n\n$$\n${tex}\n$$` : `Step ${at}:\n\n${'x'.repeat(40)}`;
}

/**
 * The project with every element's detail showing a formula and `MATH_NOTES` notes holding a display
 * block each, placed in rows below what the view shows; with `math: false`, plain text of a like length
 * in their place, to measure the same scene without Math.
 */
export function withMathDetail(
  project: ProjectSnapshot,
  { math }: { math: boolean },
): ProjectSnapshot {
  const used = new Set(project.model.elements.map((element) => element.component));
  const appearances = Object.fromEntries(
    [...used].map((id) => [id, { detail: { attributes: [MATH_ATTRIBUTE] } }]),
  );
  return {
    ...project,
    packages: project.packages.map((file) => ({
      ...file,
      components: file.components.map((component) =>
        used.has(component.id) &&
        !(component.attributes ?? []).some((each) => each.name === MATH_ATTRIBUTE)
          ? { ...component, attributes: [...(component.attributes ?? []), DEFINITION] }
          : component,
      ),
    })),
    model: {
      ...project.model,
      elements: project.model.elements.map((element, at) => ({
        ...element,
        attributes: { ...element.attributes, [MATH_ATTRIBUTE]: detailAt(at, math) },
      })),
    },
    views: project.views.map((view, at) =>
      at === 0 ? { ...view, freeShapes: [...view.freeShapes, ...mathNotes(view, math)] } : view,
    ),
    project: {
      ...project.project,
      appearances: { ...project.project.appearances, components: appearances },
    },
  };
}

/** How the notes are placed: rows of 50 below the lowest shape the view places. */
const NOTE = { width: 300, height: 140, gap: 40, columns: 50 };

function mathNotes(view: ProjectSnapshot['views'][number], math: boolean): FreeShape[] {
  let bottom = 0;
  // Shapes directly in World are placed on the canvas; the others inside them.
  for (const position of view.positions) {
    if (position.container !== undefined) continue;
    bottom = Math.max(bottom, position.y + (position.height ?? 400));
  }
  return Array.from({ length: MATH_NOTES }, (_, at) => ({
    kind: 'note' as const,
    id: `math-note-${at}`,
    x: (at % NOTE.columns) * (NOTE.width + NOTE.gap),
    y: bottom + 200 + Math.floor(at / NOTE.columns) * (NOTE.height + NOTE.gap),
    width: NOTE.width,
    height: NOTE.height,
    text: noteAt(at, math),
  }));
}

/** What typesetting distinct formulas took, in all and for each, in milliseconds. */
export interface TypesetTiming {
  count: number;
  total: number;
  /** Each formula's time, for its percentiles. */
  each: number[];
  failed: number;
}

/**
 * Typesets `count` formulas none of which was typeset before (`salt` keeps them apart from the scene's
 * and from an earlier run's), inline, and times each.
 */
export function typesetDistinct(count: number, salt: string, now: () => number): TypesetTiming {
  const each: number[] = [];
  let failed = 0;
  const began = now();
  for (let at = 0; at < count; at++) {
    const tex = `${formulaAt(at)} \\; \\mathrm{${salt}}`;
    const start = now();
    const typeset = typesetMath(tex, { display: false });
    each.push(now() - start);
    if (!typeset.ok) failed += 1;
  }
  return { count, total: now() - began, each, failed };
}
