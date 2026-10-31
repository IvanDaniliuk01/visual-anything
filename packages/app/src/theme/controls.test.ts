/**
 * Every control shows four states: under the pointer (hover), being pressed (active), unavailable
 * (disabled) and focused from the keyboard (focus-visible). `styles.css` gives every control the focus
 * ring and the muted look of what cannot be used; a control whose stylesheet gives it a look of its
 * own takes over what the browser and those shared rules would show, so its rules give the states
 * themselves (ADR 0033's clarification of A4).
 */
import { describe, expect, it } from 'vitest';
import {
  classNamesOf,
  controlClasses,
  elementsIn,
  isControl,
  statesGiven,
  statesNeeded,
  styledControls,
  subjectOf,
  withoutStates,
  type WrittenElement,
} from './controls';
import { allRules, selectorsOf } from './stylesheets';

describe('controls', () => {
  it('are found in the components, with the classes they take', () => {
    const classes = controlClasses();
    for (const name of ['comment-button', 'scenario-button', 'tour-button', 'panel-tab']) {
      expect(classes.has(name), name).toBe(true);
    }
    expect(classes.get('scenario-record')).toContain('scenario-button');
  });

  it('take the shared focus ring and disabled look of styles.css', () => {
    const shared = allRules().filter(({ path }) => path === 'styles.css');
    const focus = shared.find(
      ({ selector }) => selector.endsWith(':focus-visible') && selector.startsWith(':where('),
    );
    expect(selectorsOf(focus?.selector ?? '').map(subjectOf)).toEqual(
      expect.arrayContaining([
        'button:focus-visible',
        'select:focus-visible',
        'input:focus-visible',
        "[role='menuitem']:focus-visible",
      ]),
    );
    expect(focus?.declarations.map(({ property }) => property)).toContain('outline');
    const disabled = shared.find(
      ({ selector }) => selector.includes(':disabled') && selector.startsWith(':where('),
    );
    expect(disabled?.selector).toContain("[aria-disabled='true']");
    expect(disabled?.declarations).toEqual(
      expect.arrayContaining([{ property: 'color', value: 'var(--text-muted)' }]),
    );
  });

  it('never lose the focus ring', () => {
    const removed = allRules().flatMap((rule) =>
      rule.declarations
        .filter(
          ({ property, value }) =>
            /^outline(?:-style)?$/.test(property) && /^(?:none|0)$/.test(value),
        )
        .filter(() => !/:focus\b(?!-)/.test(rule.selector) || /:focus-visible/.test(rule.selector))
        .map(() => `${rule.path}:${rule.line} ${rule.selector}`),
    );
    expect(removed).toEqual([]);
  });

  it('each give hover, pressed, disabled and focus-visible states when they have a look of their own', () => {
    const classes = controlClasses();
    const controls = styledControls(classes);
    const missing = [...controls.values()].flatMap((control) => {
      const given = statesGiven(control.selector, controls, classes);
      const lacking = statesNeeded(control.look, control.selector).filter(
        (state) => !given.has(state),
      );
      return lacking.length === 0
        ? []
        : [
            `${control.where} ${control.selector} (${[...control.look].join(' ')}): ${lacking.join(', ')}`,
          ];
    });
    expect(missing).toEqual([]);
  });

  it('read selectors and components as they are written', () => {
    expect(
      withoutStates(".canvas-toolbar button:hover:not(:disabled, [aria-disabled='true'])"),
    ).toBe('.canvas-toolbar button');
    expect(withoutStates('.canvas-keys[open] > summary:focus-visible')).toBe(
      '.canvas-keys > summary',
    );
    expect(withoutStates("input[type='range']:active")).toBe("input[type='range']");
    expect(subjectOf('.a > .b .c:hover')).toBe('.c:hover');
    expect(selectorsOf(':where(.a, .b button):active')).toEqual(['.a:active', '.b button:active']);
    expect(
      classNamesOf(
        'className={`tour-button ${primary ? "tour-button-primary" : ""}`} type="button"',
      ),
    ).toEqual(['tour-button', 'tour-button-primary']);
    const element = (tag: string, attributes: string): WrittenElement => ({
      path: '',
      line: 1,
      tag,
      attributes,
    });
    expect(isControl(element('li', ' role="option" className="x"'))).toBe(true);
    expect(isControl(element('input', ' type="hidden"'))).toBe(false);
    expect(isControl(element('div', ' className="x"'))).toBe(false);
    expect(statesNeeded(new Set(['background']))).toEqual(['hover', 'active']);
    expect(statesNeeded(new Set(['color', 'outline']))).toEqual([
      'hover',
      'active',
      'disabled',
      'focus-visible',
    ]);
    expect(elementsIn('shell/icons.tsx').some(({ tag }) => tag === 'svg')).toBe(true);
  });

  it('count the states of a base class beside it, of a wider place, and of the element it is on', () => {
    const classes = new Map([
      ['modifier', new Set(['base', '<button>'])],
      ['base', new Set<string>()],
    ]);
    const rule = (selector: string) => ({ path: 'x.css', line: 1, selector, declarations: [] });
    const controls = styledControls(classes, [
      rule('.base:hover'),
      rule('.panel input:disabled'),
      rule('.menu button:active'),
      rule('button:focus-visible'),
    ]);
    expect(statesGiven('.modifier', controls, classes)).toEqual(new Set(['hover']));
    expect(statesGiven(".panel input[type='text']", controls, classes)).toEqual(
      new Set(['disabled']),
    );
    expect(statesGiven('.menu .modifier', controls, classes)).toEqual(new Set(['hover', 'active']));
    // The shared rules of bare elements lose to a class's own look, so they give it nothing.
    expect(statesGiven('.other', controls, classes)).toEqual(new Set());
  });
});
