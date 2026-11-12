import type { TourFile, TourStep } from '@visual-anything/schema';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { TourStage } from './TourStage';

const sample = loadSample('quadratic-function');
const tour = sample.tours[0] as TourFile;

afterEach(cleanup);

describe('a tour step’s explorable on the stage (ADR 0107)', () => {
  it('shows what its host gives beside the caption, on the side the card leaves free', () => {
    render(
      <TourStage
        project={sample}
        tour={tour}
        step={0}
        onAction={vi.fn()}
        explorable={<p>live parabola</p>}
      />,
    );
    const aside = screen.getByRole('complementary', { name: 'The explorable “Parabola”' });
    expect(aside).toHaveTextContent('live parabola');
    expect(aside).toHaveAttribute('data-side', 'right');
    expect(screen.getByRole('article')).not.toHaveTextContent('In Visual Anything');
  });

  it('goes to the left when the step puts its caption at the top right', () => {
    const right: TourFile = {
      ...tour,
      steps: tour.steps.map((step, at): TourStep =>
        at === 0 ? { ...step, caption: { ...step.caption, place: 'top-right' } } : step,
      ),
    };
    render(
      <TourStage project={sample} tour={right} step={0} onAction={vi.fn()} explorable={<p />} />,
    );
    expect(screen.getByRole('complementary')).toHaveAttribute('data-side', 'left');
  });

  it('says in the card, where no explorable runs, that the step shows one in the app', () => {
    render(<TourStage project={sample} tour={tour} step={0} onAction={vi.fn()} notes={false} />);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(within(screen.getByRole('article')).getByText(/In Visual Anything/)).toHaveTextContent(
      'In Visual Anything, this step shows the explorable “Parabola” live.',
    );
  });
});
