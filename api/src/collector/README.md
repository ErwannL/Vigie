# api/src/collector/

The ingestion gate. Nothing reaches storage without passing here.

- `validate.js` – validates one event (schema 1) and flattens it into a row, or returns a
  rejection code. Unknown fields anywhere are rejected (no way to smuggle free text).
  Applies consent: `essential` events lose `visitor`, `user`, `element`, `feature` and the
  behavioural account/context fields.
- `sanitize.js` – pattern checks: route/page **templates** (no ids, emails, tokens, query
  strings), opaque ids, `data-vigie` element ids, sensitive content in error messages.
- `ingest.js` – batches of ≤ 500 events: one bad event never rejects the batch; storage is
  idempotent on `(env, eventId)`.

Rejection codes are listed in `docs/CONTRACT.md` §4.1.
