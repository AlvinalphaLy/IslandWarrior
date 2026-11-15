/** Teammate-owned gameplay calls these hooks. No gameplay or input listeners are installed here. */
export type InputSource = 'keyboard' | 'chert' | 'harness';
export interface GameEvent {
  id: string;
  occurredAt: string;
  elapsedMs: number;
  action: string;
  source: InputSource;
  phase?: string;
  value?: number;
}
export interface Recap {
  id: string;
  outcome: 'victory' | 'defeat' | 'abandoned' | null;
  counts: Record<InputSource, number>;
  events: GameEvent[];
  damageEvents: GameEvent[];
  verification: string;
}
export function createRunHooks(base = '/api') {
  let active: { id: string; token: string; started: number } | undefined;
  let closed = false;
  let queue: GameEvent[] = [];
  let pendingOutcome: 'victory' | 'defeat' | 'abandoned' | undefined;
  let flushing: Promise<boolean> | undefined;
  let starting: Promise<boolean> | undefined;
  async function request(path: string, method = 'GET', data?: unknown) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(active ? { Authorization: `Bearer ${active.token}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Telemetry unavailable');
    return response.json();
  }
  async function flush(): Promise<boolean> {
    if (flushing) return flushing;
    flushing = (async () => {
      if (!active) return false;
      try {
        while (queue.length) {
          const batch = queue.slice(0, 100);
          await request(`/runs/${active.id}/events`, 'POST', { events: batch });
          queue.splice(0, batch.length);
        }
        if (pendingOutcome) {
          await request(`/runs/${active.id}/finish`, 'POST', { outcome: pendingOutcome });
          pendingOutcome = undefined;
        }
        return true;
      } catch {
        return false;
      }
    })();
    try {
      return await flushing;
    } finally {
      flushing = undefined;
    }
  }
  return {
    /** Call once per new fight; returns false without interrupting gameplay on service failure. */
    async startRun(): Promise<boolean> {
      if (starting) return starting;
      starting = (async () => {
        if (active && (!closed || !(await flush()))) return false;
        try {
          const r = await request('/runs', 'POST');
          active = { ...r, started: performance.now() };
          queue = [];
          pendingOutcome = undefined;
          closed = false;
          return true;
        } catch {
          return false;
        }
      })();
      try {
        return await starting;
      } finally {
        starting = undefined;
      }
    },
    recordEvent(event: Omit<GameEvent, 'id' | 'occurredAt' | 'elapsedMs'>) {
      if (!active || closed || queue.length >= 500) return false;
      queue.push({
        ...event,
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        elapsedMs: Math.floor(performance.now() - active.started),
      });
      return true;
    },
    flush,
    async finishRun(outcome: 'victory' | 'defeat' | 'abandoned') {
      if (!active || closed) return false;
      closed = true;
      pendingOutcome = outcome;
      return flush();
    },
    async getRecap(): Promise<Recap | null> {
      if (!active) return null;
      try {
        return await request(`/runs/${active.id}/recap`);
      } catch {
        return null;
      }
    },
    get status() {
      return { connected: !!active, queued: queue.length, finishPending: !!pendingOutcome };
    },
  };
}
