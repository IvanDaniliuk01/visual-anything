import { useT } from '../i18n';
import { CANVAS_KEYS } from './keys';
import './keyboard.css';

/**
 * The names of keys that are words the app uses otherwise, by the text their name is translated from:
 * the Delete key is not the Delete button.
 */
const KEY_NAMES: Readonly<Record<string, string>> = { Delete: 'the Delete key' };

/** The canvas's keyboard help: a disclosure in a corner of the canvas, listing every key. */
export function KeyboardHelp() {
  const t = useT();
  return (
    <details className="canvas-keys">
      <summary>{t('Keyboard')}</summary>
      <dl className="canvas-keys-list">
        {CANVAS_KEYS.map(({ keys, does }) => (
          <div key={keys}>
            <dt>{t.language === 'en' ? keys : t(KEY_NAMES[keys] ?? keys)}</dt>
            <dd>{t(does)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
