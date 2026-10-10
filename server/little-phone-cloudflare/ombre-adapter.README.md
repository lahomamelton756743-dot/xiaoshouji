# OB adapter — isolated first implementation

This is a **pure helper module**, not an active integration. It does not send data, read secrets, create tables, or change the Android UI.

- `prepareOmbreSource` only accepts `diary` and `memory`; paper, mail, chat and health are rejected.
- `fingerprintOmbreSource` creates a stable SHA-256 content fingerprint for eventual idempotent sync.
- `needsOmbreSync` decides whether a previously successful identical record needs resending.
- `buildRiverEntries` keeps dailybook entries as the default timeline and only adds diaries if `includeDiary` is explicitly true. It does not invent entries from OB buckets.

Run `node --test ombre-adapter.test.mjs` from this directory. Before any production integration: add explicit consent and revoke controls, a durable outbox/link table, secure OB credentials, retry behavior, deletion/privacy semantics and Android regression tests. **Do not call OB directly from the WebView.**
