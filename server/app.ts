import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { z } from 'zod';
import type { Store } from './store.js';
const eventSchema = z
  .object({
    id: z.string().uuid(),
    occurredAt: z.string().datetime(),
    elapsedMs: z.number().int().min(0).max(2147483647),
    action: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_.-]+$/),
    source: z.enum(['keyboard', 'chert', 'harness']),
    phase: z.string().min(1).max(80).optional(),
    value: z.number().finite().optional(),
  })
  .strict();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function body(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'Use application/json');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new HttpError(413, 'Body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
export function makeServer(
  store: Store,
  options: {
    production?: boolean;
    staticDir?: string;
    harness?: boolean;
    persistence?: string;
  } = {},
) {
  const buckets = new Map<string, { count: number; until: number }>();
  const server = createServer(async (req, res) => {
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        // Reject browser writes from another origin; never trust forwarded headers.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host)
          throw new HttpError(403, 'Cross-origin request rejected');
        const now = Date.now();
        if (buckets.size > 10000)
          for (const [key, b] of buckets) if (b.until < now) buckets.delete(key);
        const ip = req.socket.remoteAddress ?? 'unknown';
        let bucket = buckets.get(ip);
        if (!bucket || bucket.until < now) {
          bucket = { count: 0, until: now + 60000 };
          buckets.set(ip, bucket);
        }
        if (++bucket.count > 240) throw new HttpError(429, 'Too many requests');
        if (req.method === 'GET' && url.pathname === '/api/health')
          return send(200, { ok: true, persistence: options.persistence ?? 'memory' });
        if (req.method === 'POST' && url.pathname === '/api/runs') {
          const token = randomBytes(32).toString('base64url');
          const id = randomUUID();
          await store.create({ id, tokenHash: hash(token), startedAt: new Date().toISOString() });
          return send(201, { id, token });
        }
        const match = /^\/api\/runs\/([^/]+)\/(events|finish|recap)$/.exec(url.pathname);
        if (!match || !z.string().uuid().safeParse(match[1]).success)
          throw new HttpError(404, 'Not found');
        const [, id, operation] = match;
        const run = await store.get(id);
        const presented = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
        if (
          !run ||
          !timingSafeEqual(Buffer.from(hash(presented), 'hex'), Buffer.from(run.tokenHash, 'hex'))
        )
          throw new HttpError(404, 'Run not found');
        if (req.method === 'POST' && operation === 'events') {
          const parsed = z
            .object({ events: z.array(eventSchema).min(1).max(100) })
            .strict()
            .safeParse(await body(req));
          if (!parsed.success) throw new HttpError(400, 'Invalid events');
          const inserted = await store.append(id, parsed.data.events);
          if (inserted === null) throw new HttpError(409, 'Run is finished');
          return send(200, { inserted });
        }
        if (req.method === 'POST' && operation === 'finish') {
          const parsed = z
            .object({ outcome: z.enum(['victory', 'defeat', 'abandoned']) })
            .strict()
            .safeParse(await body(req));
          if (!parsed.success) throw new HttpError(400, 'Invalid outcome');
          if (!(await store.finish(id, parsed.data.outcome)))
            throw new HttpError(409, 'Run already has another outcome');
          return send(200, { ok: true });
        }
        if (req.method === 'GET' && operation === 'recap') {
          // Read outcome after events to avoid a stale outcome on concurrent finish.
          const events = await store.events(id);
          const current = await store.get(id);
          const counts = { keyboard: 0, chert: 0, harness: 0 };
          for (const e of events) counts[e.source]++;
          return send(200, {
            id,
            startedAt: current!.startedAt,
            finishedAt: current!.finishedAt ?? null,
            outcome: current!.outcome ?? null,
            counts,
            events,
            damageEvents: events.filter((e) => e.action === 'damage_taken'),
            verification:
              'Client-reported telemetry; source labels are not proof of verified Chert input.',
          });
        }
        throw new HttpError(405, 'Method not allowed');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        throw new HttpError(405, 'Method not allowed');
      if (url.pathname === '/integrations' && options.harness)
        return await serve(resolve('integrations/harness.html'), req, res);
      if (!options.staticDir) throw new HttpError(404, 'Not found');
      const root = resolve(options.staticDir);
      const file = resolve(
        root,
        '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
      );
      if (
        !file.startsWith(root + sep) ||
        file
          .slice(root.length)
          .split(sep)
          .some((p) => p.startsWith('.'))
      )
        throw new HttpError(404, 'Not found');
      await serve(file, req, res);
    } catch (e) {
      if (e instanceof HttpError) send(e.status, { error: e.message });
      else {
        console.error('Request failed; check service configuration privately.');
        send(503, { error: 'Service unavailable' });
      }
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
async function serve(file: string, req: IncomingMessage, res: ServerResponse) {
  let data: Buffer;
  try {
    data = await readFile(file);
  } catch {
    throw new HttpError(404, 'Not found');
  }
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
  };
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}
