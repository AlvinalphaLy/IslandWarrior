import pg from 'pg';
export type Outcome = 'victory' | 'defeat' | 'abandoned';
export interface FightEvent {
  id: string;
  occurredAt: string;
  elapsedMs: number;
  action: string;
  source: 'keyboard' | 'chert' | 'harness';
  phase?: string;
  value?: number;
}
export interface Run {
  id: string;
  tokenHash: string;
  startedAt: string;
  finishedAt?: string;
  outcome?: Outcome;
}
export interface Store {
  create(run: Run): Promise<void>;
  get(id: string): Promise<Run | undefined>;
  append(id: string, events: FightEvent[]): Promise<number | null>;
  finish(id: string, outcome: Outcome): Promise<boolean>;
  events(id: string): Promise<FightEvent[]>;
  close(): Promise<void>;
}
export class MemoryStore implements Store {
  runs = new Map<string, Run>();
  records = new Map<string, Map<string, FightEvent>>();
  async create(run: Run) {
    this.runs.set(run.id, { ...run });
    this.records.set(run.id, new Map());
  }
  async get(id: string) {
    return this.runs.get(id);
  }
  async append(id: string, events: FightEvent[]) {
    const run = this.runs.get(id);
    if (!run || run.outcome) return null;
    const records = this.records.get(id)!;
    let inserted = 0;
    for (const e of events)
      if (!records.has(e.id)) {
        records.set(e.id, { ...e });
        inserted++;
      }
    return inserted;
  }
  async finish(id: string, outcome: Outcome) {
    const r = this.runs.get(id);
    if (!r) return false;
    if (r.outcome) return r.outcome === outcome;
    r.outcome = outcome;
    r.finishedAt = new Date().toISOString();
    return true;
  }
  async events(id: string) {
    return [...(this.records.get(id)?.values() ?? [])].sort(
      (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    );
  }
  async close() {}
}
export class PostgresStore implements Store {
  pool: pg.Pool;
  constructor(url: string, ca?: string) {
    // Reject URL SSL overrides; use verified TLS, with an optional trusted CA.
    const config = new URL(url);
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
      config.searchParams.delete(key);
    this.pool = new pg.Pool({
      connectionString: config.toString(),
      ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
      max: 5,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
  }
  async create(r: Run) {
    await this.pool.query('INSERT INTO runs(id,token_hash,started_at) VALUES($1,$2,$3)', [
      r.id,
      r.tokenHash,
      r.startedAt,
    ]);
  }
  async get(id: string): Promise<Run | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM runs WHERE id=$1', [id]);
    const r = rows[0];
    return r
      ? {
          id: r.id,
          tokenHash: r.token_hash,
          startedAt: r.started_at.toISOString(),
          finishedAt: r.finished_at?.toISOString(),
          outcome: r.outcome ?? undefined,
        }
      : undefined;
  }
  async append(id: string, events: FightEvent[]) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query('SELECT outcome FROM runs WHERE id=$1 FOR UPDATE', [id]);
      if (!rows.length || rows[0].outcome) {
        await c.query('ROLLBACK');
        return null;
      }
      let inserted = 0;
      for (const e of events) {
        const r = await c.query(
          'INSERT INTO fight_events(run_id,id,occurred_at,elapsed_ms,action,source,phase,value) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',
          [
            id,
            e.id,
            e.occurredAt,
            e.elapsedMs,
            e.action,
            e.source,
            e.phase ?? null,
            e.value ?? null,
          ],
        );
        inserted += r.rowCount ?? 0;
      }
      await c.query('COMMIT');
      return inserted;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async finish(id: string, outcome: Outcome) {
    const r = await this.pool.query(
      'UPDATE runs SET outcome=COALESCE(outcome,$2), finished_at=COALESCE(finished_at,now()) WHERE id=$1 AND (outcome IS NULL OR outcome=$2)',
      [id, outcome],
    );
    return r.rowCount === 1;
  }
  async events(id: string): Promise<FightEvent[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM fight_events WHERE run_id=$1 ORDER BY occurred_at,id',
      [id],
    );
    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at.toISOString(),
      elapsedMs: r.elapsed_ms,
      action: r.action,
      source: r.source,
      ...(r.phase === null ? {} : { phase: r.phase }),
      ...(r.value === null ? {} : { value: r.value }),
    }));
  }
  async close() {
    await this.pool.end();
  }
}
