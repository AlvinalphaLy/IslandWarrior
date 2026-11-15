import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NARRATION } from '../src/data/narration.js';
const args = process.argv.slice(2),
  dry = args.includes('--dry-run');
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
if (only && !NARRATION[only]) {
  console.error('Unknown story beat. Use --only=intro, oracle, telemachus, etc.');
  process.exit(1);
}
const cards = only ? NARRATION[only] : Object.values(NARRATION).flat();
const model = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const output = resolve('public/assets/voice'),
  manifestPath = resolve(output, 'manifest.json');
type Manifest = Record<
  string,
  { hash: string; file: string; provider: string; model: string; voice: string }
>;
let manifest: Manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
    throw new Error('Voice manifest is unreadable. Fix it before generating.');
}
const planned = [];
// Validate every selected voice before any paid request, and reuse only exact script/config matches.
for (const card of cards) {
  const env = `ELEVENLABS_VOICE_${card.voice.toUpperCase()}`;
  const voice = process.env[env];
  if (!dry && !voice) {
    console.error(`Missing ${env}; set it privately in root .env.local.`);
    process.exit(1);
  }
  const hash = createHash('sha256')
    .update(JSON.stringify({ text: card.text, voice, model, format: 'mp3_44100_128' }))
    .digest('hex');
  let cached = false;
  try {
    cached =
      manifest[card.key]?.hash === hash &&
      (await stat(resolve(output, `${card.key}.mp3`))).size > 0;
  } catch {}
  if (cached) console.log(`Cached: ${card.key}`);
  else planned.push({ card, voice, hash, env });
}
console.log(
  `${planned.length} clips to generate; ${planned.reduce((n, p) => n + p.card.text.length, 0)} text characters. ${dry ? 'Dry run: no provider requests.' : 'Generation uses ElevenLabs account credits.'}`,
);
if (dry) {
  for (const p of planned) console.log(`${p.card.key}: ${p.env}`);
  process.exit(0);
}
if (!planned.length) process.exit(0);
if (!process.env.ELEVENLABS_API_KEY) {
  console.error('Set ELEVENLABS_API_KEY privately in root .env.local. No requests made.');
  process.exit(1);
}
await mkdir(output, { recursive: true });
// Persist each success immediately; a later failure must not force regeneration of earlier clips.
for (const { card, voice, hash } of planned) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice!)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text: card.text, model_id: model }),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!response.ok) {
    // Report only the provider's machine-readable error code, never raw headers or account details.
    const error = (await response.json().catch(() => null)) as {
      detail?: { status?: unknown };
    } | null;
    const status =
      typeof error?.detail?.status === 'string' && /^[a-z0-9_]{1,80}$/.test(error.detail.status)
        ? `, ${error.detail.status}`
        : '';
    console.error(
      `Generation stopped for ${card.key} (HTTP ${response.status}${status}). Check the voice ID, account access and credits privately. Earlier clips are cached; no automatic retries.`,
    );
    process.exit(1);
  }
  if (!response.headers.get('content-type')?.includes('audio/'))
    throw new Error('Provider did not return audio; stopping.');
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length) throw new Error('Empty audio response; stopping.');
  const file = `${card.key}.mp3`;
  await writeFile(resolve(output, file + '.partial'), data);
  await rename(resolve(output, file + '.partial'), resolve(output, file));
  manifest[card.key] = { hash, file, provider: 'ElevenLabs', model, voice: voice! };
  await writeFile(manifestPath + '.partial', JSON.stringify(manifest, null, 2) + '\n');
  await rename(manifestPath + '.partial', manifestPath);
  console.log(`Saved: ${file}`);
}
