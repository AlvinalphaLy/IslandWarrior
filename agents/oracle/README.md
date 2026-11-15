# IslandWarrior Oracle

Voice-only Chert/LiveKit agent generated from Chert's official starter and customized for the current game and planned Odyssey journey. It does not observe or control gameplay.

See [the integration guide](../../docs/INTEGRATIONS.md) for credentials, provider costs, the verified project, startup commands, testing and recovery.

```sh
npm ci
npm run check
npm test
```

After configuring `.env.local` privately and reviewing API costs, run `npm start` and the Chert connector in separate terminals. Never commit `.env.local`.
