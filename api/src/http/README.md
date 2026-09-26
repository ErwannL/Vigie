# api/src/http/

`app.js` builds the Fastify application with every dependency injected (tests use
`app.inject`, nothing listens). It sets on every response:
`Content-Security-Policy: default-src 'none'; frame-ancestors <VIGIE_ALLOWED_FRAME_ANCESTORS>`,
`X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control: no-store` — and no
`X-Frame-Options`, so the dashboard can be framed by the admin console.

Errors are always `{ "error": "<code>" }`; raw messages never leave the process. Requests are
logged at `debug` level by route template, without headers or bodies.

Routes live in `routes/`.
