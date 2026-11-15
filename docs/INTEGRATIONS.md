# IslandWarrior integrations

Work lives on `feat/chert-tiger-vultr`. Gameplay scenes, controls, combat, shop, inventory, maps and game UI remain teammate-owned. The Oracle is a separate process and does not currently observe or control the game.

## Local API and test harness

Requires Node 24 and npm. From the repository root:

```sh
npm ci
cp .env.example .env.local
npm run api:dev
```

Open http://localhost:3001/integrations. Start a test run, record test damage, finish it and fetch the recap. Every harness event uses `source: harness`. No gestures or real game outcomes are simulated as verified input. With no `DATABASE_URL`, storage is explicitly temporary memory and is lost on restart. The harness is disabled in production.

To serve the existing game alongside the API, run `npm run build`, then open http://localhost:3001/. For normal gameplay development, keep using `npm run dev`; no integration listeners have been added to the game.

Checks:

```sh
npm run api:check
npm run test:integrations
npm run build
npm --prefix agents/oracle run check
npm --prefix agents/oracle test
```

## Connect the Oracle to Chert

Onboarding and the hosted demo are already complete for project `53875eaf-020f-41cf-ae89-b5c661a4a8f6`. Do not rerun onboarding or initiate another demo call merely to configure the Oracle.

The Oracle uses Chert's official voice starter, customized for IslandWarrior. It uses LiveKit and OpenAI Realtime (`gpt-realtime`, voice `marin`). **OpenAI API usage is billed separately from ChatGPT; LiveKit may also charge according to its account limits.** Review those dashboards before running the agent. No model session has been started as part of implementation.

1. Create your own project at https://cloud.livekit.io/. Obtain its WebSocket URL, API key and secret from the same project.
2. Create an OpenAI API project/key at https://platform.openai.com/ and verify Realtime access and available API balance. Review https://openai.com/api/pricing/ before starting.
3. Open `agents/oracle/.env.local` in your editor and fill the three `LIVEKIT_` values and `OPENAI_API_KEY` privately. Keep `AGENT_NAME=islandwarrior-oracle`. Never paste keys in chat or commit the file. An `.env.example` documents the names.
4. From the Oracle folder:

```sh
cd agents/oracle
npm ci
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 whoami --json
```

Check that the signed-in project is `53875eaf-020f-41cf-ae89-b5c661a4a8f6`. If it differs, stop and select the intended project through Chert sign-in before proceeding. Do not replace another team's active line holder.

```sh
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 setup --env-file .env.local --project 53875eaf-020f-41cf-ae89-b5c661a4a8f6
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 doctor
npm start
```

Keep `npm start` running in terminal 1. In terminal 2, in the same Oracle folder:

```sh
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 doctor --agent islandwarrior-oracle
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 dev --agent islandwarrior-oracle
```

The agent diagnostic starts a real job. Call the number Chert displays only after readiness. Keep both processes running; stop the connector with Ctrl+C when done to release its lease. Do not use `--takeover` or `--force`. If a trial line was released, follow the CLI's recovery guidance; do not buy a plan automatically.

The Oracle waits for a caller before opening the model session and greets only on `chert_bridge_ready`. It explains documented controls and labels training/shop/dragon features as planned. Ask about controls and the planned journey, hang up, then call again. Verify audible two-way conversation; call status alone does not establish audio quality. Voice guide only: camera/video, fists, palms and game actions are not connected.

## Tiger Data

Create a Tiger Cloud PostgreSQL service using the event resources, then put its connection URL in the root `.env.local` as `DATABASE_URL`. The API connects server-side with certificate verification enabled. If your service needs a custom CA, supply a PEM path through `DATABASE_CA_FILE`. SSL URL overrides are intentionally ignored; verification cannot be disabled by URL parameters.

```sh
npm run db:migrate
npm run api:dev
```

The idempotent migration creates `runs` and `fight_events`. For this initial volume these are regular PostgreSQL tables on Tiger Data; no hypertable or aggregate dashboard is claimed. `(run_id, id)` deduplicates event retries. Event batches and run completion serialize through a row lock, and outcomes cannot change after completion.

Verify persistence: create and complete a run through the harness; keep that browser tab open, restart the API, then fetch its recap again. The token stays in that tab's memory. Reloading loses access unless the caller has retained the run credential through its own trusted session storage; this prototype has no account recovery system.

An optional database test uses a dedicated test database, creates the schema if needed, and cleans up only its own run. Set `TEST_DATABASE_URL` privately and run the test command with that environment loaded. Do not point this at a shared production database.

## Gameplay handoff

Your friend imports `createRunHooks` from `integrations/client.ts`. It does not install inputs or modify gameplay. Use one instance per active fight:

```ts
const hooks = createRunHooks('/api');
// Await once during encounter preparation. Failure disables telemetry for this fight.
await hooks.startRun();
// After the game accepts an action or applies damage:
hooks.recordEvent({ action: 'attack', source: 'keyboard', phase: 'exposed' });
hooks.recordEvent({ action: 'damage_taken', source: 'keyboard', value: 3 });
// Periodically, e.g. every two seconds, without awaiting in the combat frame loop:
void hooks.flush();
// Once the game has decided the outcome:
await hooks.finishRun('victory');
const recap = await hooks.getRecap();
```

`startRun`, `flush` and `finishRun` return booleans; `getRecap` returns null on a service error. `recordEvent` returns false without throwing if inactive, closed or full. Gameplay must continue regardless. Failures retain up to 500 queued events with their original IDs in memory; retry `flush()` on the next interval. Do not call `finishRun` repeatedly: it closes inputs once and queues completion for `flush` retries. `startRun` will not overwrite an active fight or discard an unsent previous run. Browser reload loses pending telemetry; this is a best-effort demo, not a durable offline queue.

If using Vite at port 5173, proxy `/api` to `http://127.0.0.1:3001` in the teammate's dev configuration, or test the built game from the API origin. No permissive CORS is enabled.

### API contract

| Method and path | Input / response |
| --- | --- |
| `GET /api/health` | Service and persistence mode |
| `POST /api/runs` | Returns `{id, token}`; keep token private |
| `POST /api/runs/:id/events` | `{events: [...]}`, returns `{inserted}` |
| `POST /api/runs/:id/finish` | `{outcome: 'victory' \| 'defeat' \| 'abandoned'}` |
| `GET /api/runs/:id/recap` | Outcome, source counts, events and `damageEvents` |

All per-run endpoints require `Authorization: Bearer <token>`. Only the SHA-256 token hash is stored. Events have UUID `id`, ISO UTC `occurredAt`, nonnegative integer `elapsedMs`, `action`, `source` (`keyboard`, `chert`, `harness`), and optional `phase`/numeric `value`. Batch limit: 100 events, request limit: 64 KiB. A repeated event ID retains the first stored event. Finish is idempotent for the same outcome and returns 409 for a conflicting outcome; new events after finish return 409.

**Source labels are client-reported telemetry, not attestation of a verified FaceTime gesture.** A later trusted Chert adapter must establish verified call-to-run pairing before making that claim. This API does not receive caller video, webhooks or game commands.

## Vultr deployment (prepared, not provisioned)

Wait until the local game/API and live database are verified. Use one Shared CPU instance with 1 vCPU, 2 GB RAM and Ubuntu 24.04 LTS. Check active promotional credit in billing; server usage, add-ons and expired credits can result in charges.

1. Create the server with your SSH key, set DNS for a hostname you control to its public IPv4, and allow inbound TCP 80/443 plus SSH restricted to your IP.
2. Install Docker Engine and the Compose plugin using Docker's Ubuntu instructions. Clone this integration branch onto the server.
3. Create root `.env.local` privately with the Tiger Data URL. Omit `DATABASE_CA_FILE` when using system-trusted TLS; if a CA is required, mount its PEM into the app container and use its container path. Set `DOMAIN` in your shell to the DNS hostname.
4. From the repository root:

```sh
export DOMAIN=game.example.com  # replace with your actual DNS hostname
docker compose -f deploy/compose.yaml build app
docker compose -f deploy/compose.yaml run --rm app npm run db:migrate
docker compose -f deploy/compose.yaml up -d
```

Caddy obtains HTTPS certificates and proxies the game/API through one origin. Its certificate volumes persist. The app port binds to localhost only. Production refuses memory storage and disables the test harness. The Oracle remains on your laptop for this milestone; no secrets are embedded in the Docker image.

Verify from another device: game loads, `/api/health` responds, a newly created run accepts authenticated events and its recap can be fetched. Check `docker compose -f deploy/compose.yaml logs --tail=50` for startup failures; keep logs private. Rebuild after pulling updates. To stop containers use `docker compose -f deploy/compose.yaml down`; to stop Vultr instance charges after the event, back up needed data and destroy the instance through Vultr. Container shutdown alone does not remove the billable VM.

## Verification performed in this workspace

- Game production build and API TypeScript check passed.
- Five API/client tests passed, including lost-response retries without duplicate events and failed-service behavior.
- Two Oracle bridge-greeting tests passed; the module imports successfully with the installed LiveKit packages.
- Chrome smoke passed for the harness journey and the existing game canvas. Run again with `npm run smoke:integrations`; set `CHROME_PATH` if Chrome is elsewhere.
- Live PostgreSQL persistence test was skipped because no dedicated test database was configured. To run it after adding `TEST_DATABASE_URL` to root `.env.local`: `node --env-file=.env.local --import tsx --test server/postgres.test.ts`.
- Live FaceTime with this customized Oracle, model audio quality, Tiger Data connectivity, and the Docker/Vultr deployment remain unverified pending credentials/infrastructure. The user's earlier hosted Chert demo is separate from the custom Oracle.
- The root production dependency audit reports zero advisories. Existing root development dependencies retain advisories. The updated Oracle dependency tree retains five moderate advisories through LiveKit's glob/minimatch tooling; no high advisories remain in that tree. Do not run `npm audit fix --force`: its suggested LiveKit downgrade changes the supported API. Revisit these with upstream updates before a broader release.
