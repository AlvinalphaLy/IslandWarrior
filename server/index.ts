import { readFile } from 'node:fs/promises';
import { MemoryStore, PostgresStore } from './store.js';
import { makeServer } from './app.js';
const production = process.env.NODE_ENV === 'production';
if (production && !process.env.DATABASE_URL) throw new Error('Production requires DATABASE_URL');
const store = process.env.DATABASE_URL
  ? new PostgresStore(
      process.env.DATABASE_URL,
      process.env.DATABASE_CA_FILE
        ? await readFile(process.env.DATABASE_CA_FILE, 'utf8')
        : undefined,
    )
  : new MemoryStore();
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = makeServer(store, {
  production,
  staticDir: process.env.STATIC_DIR ?? 'dist',
  harness: !production,
  persistence: process.env.DATABASE_URL ? 'postgres' : 'memory (temporary, lost on restart)',
});
server.listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log(
    `Integration API listening on port ${port}; storage: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'temporary memory'}`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => void store.close().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10000).unref();
  });
