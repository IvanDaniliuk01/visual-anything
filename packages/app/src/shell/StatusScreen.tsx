import { useId, type ReactNode } from 'react';
import { Header } from './Header';

interface StatusScreenProps {
  title: string;
  /** Progress is announced politely; a problem is announced at once. */
  tone: 'progress' | 'problem';
  children?: ReactNode;
}

/** What the app shows instead of the shell while no project is open. */
export function StatusScreen({ title, tone, children }: StatusScreenProps) {
  const heading = useId();
  return (
    <div className="status-screen">
      <Header />
      <main className="status-main" aria-labelledby={heading}>
        <section
          className={`status-card status-${tone}`}
          role={tone === 'problem' ? 'alert' : 'status'}
        >
          <h2 id={heading}>{title}</h2>
          {children}
        </section>
      </main>
    </div>
  );
}
