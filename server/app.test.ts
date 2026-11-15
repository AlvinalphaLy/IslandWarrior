import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeServer } from './app.js';
import { MemoryStore } from './store.js';
import type { Store } from './store.js';
import { createRunHooks } from '../integrations/client.js';
async function fixture(t: any, store: Store = new MemoryStore()) {
  const server = makeServer(store, { harness: true });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await store.close();
  });
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api`;
  const call = (path: string, method = 'GET', data?: unknown, token?: string) =>
    fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  return { call, base };
}
const event = (source = 'harness') => ({
  id: randomUUID(),
  occurredAt: new Date().toISOString(),
  elapsedMs: 10,
  action: 'damage_taken',
  source,
  phase: 'test',
  value: 3,
});
test('run authorization, deduplication, recap and immutable completion', async (t) => {
  const { call } = await fixture(t);
  const run = await (await call('/runs', 'POST')).json();
  assert.equal((await call(`/runs/${run.id}/recap`)).status, 404);
  assert.equal((await call(`/runs/${run.id}/recap`, 'GET', undefined, 'wrong')).status, 404);
  const events = [event('keyboard'), event('chert'), event()];
  assert.equal(
    (await (await call(`/runs/${run.id}/events`, 'POST', { events }, run.token)).json()).inserted,
    3,
  );
  assert.equal(
    (await (await call(`/runs/${run.id}/events`, 'POST', { events }, run.token)).json()).inserted,
    0,
  );
  assert.equal(
    (await call(`/runs/${run.id}/finish`, 'POST', { outcome: 'victory' }, run.token)).status,
    200,
  );
  assert.equal(
    (await call(`/runs/${run.id}/finish`, 'POST', { outcome: 'victory' }, run.token)).status,
    200,
  );
  assert.equal(
    (await call(`/runs/${run.id}/finish`, 'POST', { outcome: 'defeat' }, run.token)).status,
    409,
  );
  assert.equal(
    (await call(`/runs/${run.id}/events`, 'POST', { events: [event()] }, run.token)).status,
    409,
  );
  const recap = await (await call(`/runs/${run.id}/recap`, 'GET', undefined, run.token)).json();
  assert.deepEqual(recap.counts, { keyboard: 1, chert: 1, harness: 1 });
  assert.equal(recap.damageEvents.length, 3);
  assert.equal(recap.outcome, 'victory');
  assert.ok(!('tokenHash' in recap));
});
test('reject invalid events, foreign browser origins and oversized bodies', async (t) => {
  const { call, base } = await fixture(t);
  const run = await (await call('/runs', 'POST')).json();
  for (const events of [[event('fake')], [], [{ ...event(), value: 'bad' }]])
    assert.equal((await call(`/runs/${run.id}/events`, 'POST', { events }, run.token)).status, 400);
  assert.equal(
    (await fetch(base + '/runs', { method: 'POST', headers: { Origin: 'https://other.example' } }))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        `/runs/${run.id}/events`,
        'POST',
        { events: [{ ...event(), action: 'x'.repeat(70000) }] },
        run.token,
      )
    ).status,
    413,
  );
});
test('service failures return a safe 503 and hooks fail without throwing', async (t) => {
  const store = new MemoryStore();
  store.create = async () => {
    throw Error('secret database connection');
  };
  const { call, base } = await fixture(t, store);
  const response = await call('/runs', 'POST');
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('secret'));
  const hooks = createRunHooks(base);
  assert.equal(await hooks.startRun(), false);
  assert.equal(hooks.recordEvent({ action: 'attack', source: 'keyboard' }), false);
});
test('game hooks flush before finishing, keep input sources and start a fresh run', async (t) => {
  const { base } = await fixture(t);
  const hooks = createRunHooks(base);
  assert.equal(await hooks.startRun(), true);
  assert.equal(await hooks.startRun(), false);
  hooks.recordEvent({ action: 'attack', source: 'keyboard' });
  hooks.recordEvent({ action: 'damage_taken', source: 'harness', value: 2 });
  assert.equal(await hooks.finishRun('victory'), true);
  assert.equal(hooks.recordEvent({ action: 'attack', source: 'keyboard' }), false);
  const recap = await hooks.getRecap();
  assert.equal(recap?.outcome, 'victory');
  assert.equal(recap?.counts.keyboard, 1);
  assert.equal(await hooks.startRun(), true);
  assert.equal((await hooks.getRecap())?.events.length, 0);
});
test('uncertain event response retries with stable IDs before pending completion', async (t) => {
  const { base } = await fixture(t);
  const hooks = createRunHooks(base);
  assert.equal(await hooks.startRun(), true);
  hooks.recordEvent({ action: 'attack', source: 'keyboard' });
  const original = globalThis.fetch;
  let fail = true;
  t.mock.method(globalThis, 'fetch', async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    if (String(args[0]).endsWith('/events') && fail) {
      fail = false;
      throw Error('response lost after commit');
    }
    return response;
  });
  assert.equal(await hooks.finishRun('victory'), false);
  assert.equal(hooks.status.queued, 1);
  assert.equal(hooks.status.finishPending, true);
  assert.equal(await hooks.flush(), true);
  const recap = await hooks.getRecap();
  assert.equal(recap?.events.length, 1);
  assert.equal(recap?.outcome, 'victory');
});
