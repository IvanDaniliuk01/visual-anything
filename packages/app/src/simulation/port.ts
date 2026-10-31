/**
 * The tab's simulation store hears the code worker's host through this (ADR 0085): the host is lent
 * to it while the shell is mounted, and taken back when it unmounts, so that the store, made once
 * for the tab, keeps hearing the host however often React mounts the shell's effects again.
 */
import type { SimulationReply, SimulationRequest } from './messages';
import type { SimulationPort } from './store';

export class LentSimulationPort implements SimulationPort {
  private host: SimulationPort | undefined;
  private unhear: (() => void) | undefined;
  private readonly listeners = new Set<(reply: SimulationReply) => void>();

  /** Lends the host, or none; answers how to take it back. */
  lend(host: SimulationPort | undefined): () => void {
    this.unhear?.();
    this.host = host;
    this.unhear = host?.onSimulation((reply) => {
      for (const listener of [...this.listeners]) listener(reply);
    });
    return () => {
      if (this.host !== host) return;
      this.unhear?.();
      this.unhear = undefined;
      this.host = undefined;
    };
  }

  /** Asks the host lent; false without one, as without a worker. */
  simulate(request: SimulationRequest): boolean {
    return this.host?.simulate(request) ?? false;
  }

  onSimulation(listener: (reply: SimulationReply) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
