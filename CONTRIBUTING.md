# Contributing to Nora

## Development

```sh
bun link
bun install
bun dev
bun run android
```

## Tests

Run the regular test suite with Bun:

```sh
bun test
```

### Local sync integration tests

Sync integration tests run against a local Supabase instance with the Nora schema
loaded and exposed through the API:

```sh
NORA_SYNC_URL=http://127.0.0.1:55431 \
NORA_SYNC_ANON_KEY=... \
NORA_SYNC_SERVICE_ROLE_KEY=... \
bun run test:sync:local
```

The suite creates and cleans up test users and runs the syncers with independent
device processes. It accepts only loopback HTTP URLs. Ordinary `bun test` skips
these tests. They cover sync and database behavior using in-memory native storage
adapters and do not launch the app UI.
