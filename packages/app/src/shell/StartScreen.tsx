import { useId, useState } from 'react';
import { useT } from '../i18n';
import type { CommandResult, StartChoice, StartOffer } from '../live/connection';
import { Header } from './Header';
import { SAMPLE_TEXTS } from './sampleTexts';
import './start.css';

interface StartScreenProps {
  offer: StartOffer;
  /** Starts the project chosen; absent while the connection cannot carry it. */
  startProject?: ((choice: StartChoice) => Promise<CommandResult>) | undefined;
}

/**
 * What the app shows while the local program runs on a folder that holds no project yet (ADR 0051):
 * the samples a new project can start from, and an empty project. Choosing one writes the project in
 * the folder, and every tab of the session then shows it.
 */
export function StartScreen({ offer, startProject }: StartScreenProps) {
  const t = useT();
  const heading = useId();
  const problemId = useId();
  const [starting, setStarting] = useState<string>();
  const [problem, setProblem] = useState<string>();

  const start = async (key: string, choice: StartChoice) => {
    if (startProject === undefined || starting !== undefined) return;
    setStarting(key);
    setProblem(undefined);
    const result = await startProject(choice);
    if (!result.ok) {
      setStarting(undefined);
      setProblem(result.problems.map((each) => t.message(each.message)).join(' '));
    }
  };

  const disabled = startProject === undefined || starting !== undefined;
  return (
    <div className="status-screen">
      <Header />
      <main className="status-main" aria-labelledby={heading}>
        <section className="status-card start-card" aria-busy={starting !== undefined}>
          <h2 id={heading}>{t('Start a project in “{folder}”', { folder: offer.folder })}</h2>
          <p>
            {t(
              'This folder holds no project yet. Start one from a sample, or empty; everything can be changed afterwards.',
            )}
          </p>
          <ul className="start-choices" aria-label={t('Ways to start')}>
            {offer.samples.map((sample) => {
              const texts = SAMPLE_TEXTS[sample.id];
              const title = texts === undefined ? sample.name : t(texts.title);
              return (
                <li key={sample.id} className="start-choice">
                  <h3>{title}</h3>
                  {texts !== undefined && <p>{t(texts.description)}</p>}
                  <button
                    type="button"
                    className="inspector-action"
                    disabled={disabled}
                    aria-label={t('Start from the sample “{name}”', { name: title })}
                    aria-describedby={problem === undefined ? undefined : problemId}
                    onClick={() => void start(sample.id, { sample: sample.id })}
                  >
                    {starting === sample.id ? t('Starting…') : t('Start from this sample')}
                  </button>
                </li>
              );
            })}
            <li className="start-choice">
              <h3>{t('An empty project')}</h3>
              <p>
                {t(
                  'It uses the built-in Systems package and has one view; the Components tab adds more packages.',
                )}
              </p>
              <button
                type="button"
                className="inspector-action"
                disabled={disabled}
                aria-describedby={problem === undefined ? undefined : problemId}
                onClick={() => void start('empty', { names: { view: t('Overview') } })}
              >
                {starting === 'empty' ? t('Starting…') : t('Start an empty project')}
              </button>
            </li>
          </ul>
          {problem !== undefined && (
            <p id={problemId} className="start-problem" role="alert">
              {problem}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
