# api/src/adapters/issues/

`IssueSink.open(payload) → { ref }` and `IssueSink.update(ref, payload)`.

- `fake.js` – refs derived from the incident (`FAKE-prod-12`), identical in every process;
  payloads kept in memory for inspection.
- `orqea.js` – stub for Orqea's issue board (`VIGIE_ISSUES_URL`, `VIGIE_ISSUES_TOKEN`).

The payload (built by `modules/incidents/report.js`) is described in `docs/CONTRACT.md` §4.4.
It contains templates, catalogue keys, shares and numbers, never a user identity.
