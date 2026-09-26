# api/src/http/routes/

| File           | Routes                                                                               | Auth                           |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| `public.js`    | `GET /healthz`, `GET /readyz`, `POST /auth/sso`                                      | none                           |
|                | `POST /v1/events`, `GET`/`DELETE /v1/subjects/:user`                                 | ingestion bearer               |
| `settings.js`  | `/v1/session`, `/v1/catalogues`, `/v1/settings`, `/v1/routes`, `/v1/compare/latency` | session                        |
| `incidents.js` | `/v1/incidents[/:id[/replay                                                          | /resolve]]`, `POST /v1/detect` | session |
| `insights.js`  | `/v1/insights/{usage,landing,funnels,segments,errors}`, `/v1/personas[/preview       | /push]`                        | session |

Every operator route takes a required `env` (query or body). Full reference:
`docs/CONTRACT.md`.
