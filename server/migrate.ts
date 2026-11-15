import { readFile } from 'node:fs/promises';
import { PostgresStore } from './store.js';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL privately in .env.local');
const store = new PostgresStore(
  process.env.DATABASE_URL,
  process.env.DATABASE_CA_FILE ? await readFile(process.env.DATABASE_CA_FILE, 'utf8') : undefined,
);
try {
  await store.pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  console.log('Database migration complete');
} catch {
  console.error('Migration failed. Check database access and TLS configuration privately.');
  process.exitCode = 1;
} finally {
  await store.close();
}
