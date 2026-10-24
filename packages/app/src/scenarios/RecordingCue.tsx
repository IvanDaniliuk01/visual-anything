import './scenarios.css';

/** Says on the canvas that clicks on relations record steps, while they do. */
export function RecordingCue() {
  return (
    <p className="canvas-recording" aria-live="polite">
      Recording: click relations in order. Shift+click adds one to the same step.
    </p>
  );
}
