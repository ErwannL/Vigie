# api/src/store/

PostgreSQL access. Every repository function takes the environment as first argument.

- `db.js` – pool with statement and connection timeouts; `ping()` for `/readyz`.
- `migrate.js` / `migrate-cli.js` – applies `migrations/*.sql` in order, one transaction each.
- `events.js` – raw events: idempotent batch insert, subject export/erasure, retention delete.
- `incidents.js` – incident rows ↔ objects.
- `misc.js` – single-use SSO `jti`, audit log, persona sets.
