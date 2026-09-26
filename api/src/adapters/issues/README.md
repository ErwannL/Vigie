# api/src/adapters/issues/

`IssueSink.open(payload) → { ref }` and `IssueSink.update(ref, payload)`.

- `fake.js` – refs derived from the incident (`FAKE-prod-12`), identical in every process;
  payloads kept in memory for inspection.
- `orqea.js` – Orqea's issue board: `POST {VIGIE_ISSUES_URL}` → `{ ref }`,
  `PUT {VIGIE_ISSUES_URL}/{ref}`, bearer `VIGIE_ISSUES_TOKEN`.

The payload (built by `modules/incidents/report.js`) is described in `docs/CONTRACT.md` §5.
It contains templates, catalogue keys, shares and numbers, never a user identity.
