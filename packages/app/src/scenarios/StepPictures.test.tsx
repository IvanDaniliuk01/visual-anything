/**
 * The step editor's Shows (ADR 0098, stage 4): a checkbox for each picture, video and link card of
 * the view, whether a video plays beside it, what is gone listed and taken out, and a changed list
 * that names only what the view holds.
 */
import type { FreeShape, Picture, ViewFile } from '@visual-anything/schema';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StepPictures, type PictureLists } from './StepPictures';

const ref = (hash: string, format: Picture['media']['format']) => ({
  hash: hash.repeat(64),
  format,
  width: 640,
  height: 360,
  bytes: 1000,
});
const photo: Picture = {
  kind: 'picture',
  id: 'photo',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  media: ref('a', 'jpeg'),
  name: 'Waiting room',
};
const video: Picture = { ...photo, id: 'video', media: ref('b', 'mp4'), name: 'Check-in' };
const card: FreeShape = {
  kind: 'link',
  id: 'card',
  x: 0,
  y: 0,
  width: 320,
  height: 112,
  url: 'https://www.example.com/guide',
  title: 'Guide',
};
const view: ViewFile = {
  id: 'board',
  name: 'Board',
  perspective: { name: 'Board' },
  nestingRelationTypes: [],
  positions: [],
  freeShapes: [
    { kind: 'note', id: 'note', x: 0, y: 0, width: 1, height: 1, text: 'Hi' },
    photo,
    video,
    card,
  ],
};

function shown(lists: PictureLists, chooses = true) {
  const onChange = vi.fn<(lists: PictureLists) => void>();
  render(
    <StepPictures
      view={view}
      lists={lists}
      chooses={chooses}
      owner="scenario"
      editable
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('StepPictures', () => {
  it('lists the pictures, videos and link cards of the view, never a note', () => {
    shown({});
    expect(
      screen
        .getAllByRole('checkbox', { name: /Picture|Video|Link card/ })
        .map((box) => box.getAttribute('type')),
    ).toHaveLength(3);
    expect(screen.getByRole('checkbox', { name: 'Picture: Waiting room' })).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Link card: Guide, example.com' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Hi')).toBeNull();
  });

  it('says that every picture shows while no step chooses', () => {
    shown({}, false);
    expect(
      screen.getByText(
        'No step chooses: the scenario shows every picture, video and link card of its view.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a picture, and plays a video only once it shows', () => {
    const onChange = shown({ shows: ['photo'] });
    const plays = screen.getByRole('checkbox', { name: 'Play “Check-in” while the step shows' });
    expect(plays).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Video: Check-in' }));
    expect(onChange).toHaveBeenLastCalledWith({ shows: ['photo', 'video'], playing: [] });
  });

  it('stops playing a video it no longer shows', () => {
    const onChange = shown({ shows: ['photo', 'video'], playing: ['video'] });
    expect(
      screen.getByRole('checkbox', { name: 'Play “Check-in” while the step shows' }),
    ).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Video: Check-in' }));
    expect(onChange).toHaveBeenLastCalledWith({ shows: ['photo'], playing: [] });
  });

  it('lists what is gone, takes it out, and leaves it out of any change', () => {
    const onChange = shown({ shows: ['gone', 'photo'] });
    expect(screen.getByText('No longer in the view (gone).')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take out what is gone' }));
    expect(onChange).toHaveBeenLastCalledWith({ shows: ['photo'] });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Link card: Guide, example.com' }));
    expect(onChange).toHaveBeenLastCalledWith({ shows: ['photo', 'card'], playing: [] });
  });
});
