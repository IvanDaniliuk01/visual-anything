import { describe, expect, it } from 'vitest';
import { StillQueue, type StillJob } from './still-queue';

/** A take that resolves when the test says. */
function deferred() {
  let resolve: (value: string) => void = () => {};
  const promise = new Promise<string>((done) => (resolve = done));
  return { promise, resolve };
}

function harness(most = 8) {
  const started: string[] = [];
  const pending = new Map<string, (value: string) => void>();
  const released: string[] = [];
  const arrived: string[] = [];
  const queue = new StillQueue<string>({
    most,
    release: (value) => released.push(value),
    onArrive: (key) => arrived.push(key),
  });
  const job = (key: string, distance = 0): StillJob<string> => ({
    key,
    distance,
    take: () => {
      started.push(key);
      const next = deferred();
      pending.set(key, next.resolve);
      return next.promise;
    },
  });
  const finish = async (key: string) => {
    pending.get(key)?.(`still of ${key}`);
    pending.delete(key);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { queue, job, started, finish, released, arrived };
}

describe('stills are taken one at a time', () => {
  it('takes the one nearest the middle first, and the next once it is done', async () => {
    const { queue, job, started, finish, arrived } = harness();
    queue.want([job('far', 300), job('near', 10), job('middle', 100)]);
    expect(started).toEqual(['near']);
    expect(queue.busy).toBe(true);
    await finish('near');
    expect(arrived).toEqual(['near']);
    expect(queue.result('near')).toBe('still of near');
    expect(started).toEqual(['near', 'middle']);
    await finish('middle');
    await finish('far');
    expect(started).toEqual(['near', 'middle', 'far']);
    expect(queue.busy).toBe(false);
  });

  it('never takes again a still it keeps or is taking, and forgets what is no longer wanted', async () => {
    const { queue, job, started, finish } = harness();
    queue.want([job('a'), job('b', 5)]);
    queue.want([job('a'), job('c', 1)]);
    await finish('a');
    expect(started).toEqual(['a', 'c']);
    await finish('c');
    queue.want([job('a'), job('c')]);
    expect(started).toEqual(['a', 'c']);
  });

  it('takes what is asked for now before what the canvas waits for', async () => {
    const { queue, job, started, finish } = harness();
    queue.want([job('a'), job('b', 1)]);
    const asked = queue.ask(job('claude'));
    await finish('a');
    expect(started).toEqual(['a', 'claude']);
    await finish('claude');
    expect(await asked).toBe('still of claude');
    expect(started).toEqual(['a', 'claude', 'b']);
  });

  it('answers what is asked for from what it keeps', async () => {
    const { queue, job, started, finish } = harness();
    queue.want([job('a')]);
    await finish('a');
    expect(await queue.ask(job('a'))).toBe('still of a');
    expect(started).toEqual(['a']);
  });

  it('keeps at most so many, letting the oldest used go', async () => {
    const { queue, job, finish, released } = harness(2);
    for (const key of ['a', 'b', 'c']) {
      queue.want([job(key)]);
      queue.result('a');
      await finish(key);
    }
    expect(released).toEqual(['still of b']);
    expect(queue.result('a')).toBe('still of a');
    expect(queue.result('b')).toBeUndefined();
  });

  it('goes on after a take that fails', async () => {
    const { queue, started } = harness();
    queue.want([
      { key: 'bad', distance: 0, take: () => Promise.reject(new Error('no')) },
      { key: 'good', distance: 1, take: () => (started.push('good'), Promise.resolve('ok')) },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(['good']);
    expect(queue.result('good')).toBe('ok');
  });
});
