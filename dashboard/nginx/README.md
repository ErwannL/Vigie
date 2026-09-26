# dashboard/nginx/

Configuration of the `dashboard` container (`nginxinc/nginx-unprivileged`, port 8080).

- `default.conf.template` – rendered by the image at start (envsubst). Serves the built SPA,
  proxies `/api/` to the API service (same origin: no CORS, no third-party cookies), and sets
  the CSP including `frame-ancestors`.
- `15-vigie-csp.envsh` – sourced by the image entrypoint before rendering: turns
  `VIGIE_ALLOWED_FRAME_ANCESTORS` (space/comma separated; `self`/`none` may be unquoted) into
  a valid CSP source list, with the same rule as the API.
