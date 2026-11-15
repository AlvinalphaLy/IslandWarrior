import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PostgresStore } from './store.js';
test(
  'Tiger Data retains deduplicated events and completion across reconnection',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const url = process.env.TEST_DATABASE_URL!;
    let store = new PostgresStore(url);
    const id = randomUUID();
    try {
      await store.pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
      await store.create({ id, tokenHash: 'test-hash', startedAt: new Date().toISOString() });
      const e = {
        id: randomUUID(),
        occurredAt: new Date().toISOString(),
        elapsedMs: 1,
        action: 'damage_taken',
        source: 'harness' as const,
        value: 2,
      };
      assert.equal(await store.append(id, [e, e]), 1);
      assert.equal(await store.finish(id, 'victory'), true);
      await store.close();
      store = new PostgresStore(url);
      assert.equal((await store.get(id))?.outcome, 'victory');
      assert.equal((await store.events(id)).length, 1);
      assert.equal(await store.append(id, [{ ...e, id: randomUUID() }]), null);
    } finally {
      await store.pool.query('DELETE FROM fight_events WHERE run_id=$1', [id]);
      await store.pool.query('DELETE FROM runs WHERE id=$1', [id]);
      await store.close();
    }
  },
);
