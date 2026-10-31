/**
 * What the app says of simulation runs (ADR 0085): the tick and its simulated time, each stop in
 * words with its tick, and why a run cannot run, in English and in Spanish.
 */
import { describe, expect, it } from 'vitest';
import { translatorFor } from '../i18n/t';
import { LOAD } from '../test/simulation';
import { simulatedTime, speedText, stopText, tickText, unavailableText, valueText } from './words';

const en = translatorFor('en');
const es = translatorFor('es');

describe('the words of simulation runs', () => {
  it('say the tick shown and the simulated time it stands for', () => {
    expect(simulatedTime(LOAD, 3)).toBe('6 s');
    expect(tickText(en, LOAD, 3, 20)).toBe('Tick 3 of 19, at 6 s');
    expect(tickText(es, LOAD, 3, 20)).toBe('Tic 3 de 19, a los 6 s');
    const plain = { ...LOAD };
    delete plain.tick;
    expect(simulatedTime(plain, 3)).toBeUndefined();
    expect(tickText(en, plain, 3, 20)).toBe('Tick 3 of 19');
  });

  it('say each stop with its tick and its reason', () => {
    expect(stopText(en, { kind: 'done', tick: 4, message: 'Closed.' }, LOAD)).toBe(
      'It ended by itself at tick 4: Closed.',
    );
    expect(stopText(en, { kind: 'done', tick: 4 }, LOAD)).toBe('It ended by itself at tick 4.');
    expect(stopText(en, { kind: 'ticks', tick: 19 }, LOAD)).toBe('It played its 20 ticks.');
    expect(
      stopText(
        en,
        { kind: 'limit', tick: 2, value: 'queue', limit: 'max', bound: 50, got: 57 },
        LOAD,
      ),
    ).toBe(
      'At tick 2, “queue” went above its highest limit, 50 items: it was 57 items. The ticks before it are kept.',
    );
    expect(
      stopText(
        en,
        { kind: 'limit', tick: 2, value: 'queue', limit: 'min', bound: 0, got: -1 },
        LOAD,
      ),
    ).toContain('went below its lowest limit, 0 items');
    expect(
      stopText(en, { kind: 'limit', tick: 5, value: 'phase', limit: 'choices', got: 'odd' }, LOAD),
    ).toContain('“phase” was “odd”, which is not one of its choices');
    expect(
      stopText(en, { kind: 'limit', tick: 5, value: 'queue', limit: 'finite', got: 0 }, LOAD),
    ).toContain('was not a finite number');
    expect(
      stopText(en, { kind: 'failed', tick: 7, failure: { kind: 'threw', message: 'oops' } }, LOAD),
    ).toBe('At tick 7, the code failed: oops');
    expect(stopText(en, { kind: 'failed', tick: 7, failure: { kind: 'time' } }, LOAD)).toContain(
      'ran past its time',
    );
    expect(stopText(en, { kind: 'failed', tick: 7, failure: { kind: 'memory' } }, LOAD)).toContain(
      'more memory',
    );
    expect(
      stopText(en, { kind: 'failed', tick: 7, failure: { kind: 'answer', reason: 'Bad.' } }, LOAD),
    ).toBe('At tick 7, the code’s answer was refused: Bad.');
    expect(stopText(en, { kind: 'full', tick: 9000 }, LOAD)).toContain('is full');
    expect(stopText(en, { kind: 'changed', tick: 12 }, LOAD)).toContain('The model changed');
  });

  it('say the stops in Spanish', () => {
    expect(stopText(es, { kind: 'ticks', tick: 19 }, LOAD)).toBe('Reprodujo sus 20 tics.');
    expect(
      stopText(
        es,
        { kind: 'limit', tick: 2, value: 'queue', limit: 'max', bound: 50, got: 57 },
        LOAD,
      ),
    ).toBe(
      'En el tic 2, “queue” pasó su límite superior, 50 items: valía 57 items. Se conservan los tics anteriores.',
    );
  });

  it('say why a run cannot run, naming the package', () => {
    expect(unavailableText(en, 'not-approved', 'Test')).toBe(
      'The code of “Test” is not approved, so it cannot simulate. Review it to approve it.',
    );
    expect(unavailableText(en, 'no-code', 'Test')).toContain('exports no simulate hook');
    expect(unavailableText(en, 'off', 'Test')).toContain('turned off');
    expect(unavailableText(en, 'too-many', 'Test')).toContain('as many simulations as it may');
    expect(unavailableText(es, 'not-approved', 'Test')).toContain('no está aprobado');
  });

  it('write values and speeds', () => {
    expect(valueText(en, 12.3456789, 'ms')).toBe('12.3457 ms');
    expect(valueText(en, true)).toBe('true');
    expect(valueText(es, false)).toBe('falso');
    expect(speedText(en, 1)).toBe('1 tick a second');
    expect(speedText(en, 20)).toBe('20 ticks a second');
    expect(speedText(es, 'max')).toBe('Lo más rápido posible');
  });
});
