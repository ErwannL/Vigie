# api/src/store/migrations/

Plain SQL files applied in name order by `../migrate.js` and recorded in `schema_migrations`.
Never edit an applied migration; add a new file.

`001_init.sql`: `events` is **LIST-partitioned by `env`** (`events_dev`, `events_recette`,
`events_prod`), with `env` in the primary key and every index; aggregates, incidents,
persona sets and the audit log all carry an `env` column with a CHECK constraint.
