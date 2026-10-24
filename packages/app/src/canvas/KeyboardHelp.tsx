import { CANVAS_KEYS } from './keys';
import './keyboard.css';

/** The canvas's keyboard help: a disclosure in a corner of the canvas, listing every key. */
export function KeyboardHelp() {
  return (
    <details className="canvas-keys">
      <summary>Keyboard</summary>
      <dl className="canvas-keys-list">
        {CANVAS_KEYS.map(({ keys, does }) => (
          <div key={keys}>
            <dt>{keys}</dt>
            <dd>{does}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
