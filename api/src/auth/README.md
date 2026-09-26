# api/src/auth/

- `ingest.js` – `Authorization: Bearer <secret>` for server-to-server calls. One secret per
  Orqea environment; the **matched secret decides the environment**. Secrets shorter than 32
  characters are treated as absent. Comparison is constant time (SHA-256 then
  `timingSafeEqual`) and every configured secret is compared.
- `jwt.js` – verifies the admin console's HS256 handoff token (`iss: orqea`, `aud: vigie`,
  `sub`, `iat`, `exp` with a lifetime ≤ 60 s, `jti`). Also `signHs256` for tests and for the
  integrator's reference. `jti` single use is enforced by the `sso_jti` table.
- `session.js` – Vigie's own operator session: a short-lived HMAC-signed bearer token
  (`VIGIE_SESSION_SECRET`, distinct from `VIGIE_SSO_SECRET`), carrying the operator id and the
  display name used for the audit log only.
