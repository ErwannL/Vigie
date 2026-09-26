-- Raw events. LIST-partitioned by environment: each environment lives in its own physical
-- table, and `env` is part of the primary key and of every index.
CREATE TABLE events (
  env text NOT NULL CHECK (env IN ('dev', 'recette', 'prod')),
  event_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  type text NOT NULL,
  consent text NOT NULL,
  visitor text,
  session text,
  user_id text,
  plan text,
  seats integer,
  age_days integer,
  segment text,
  country text,
  locale text,
  device text,
  theme text,
  app_version text,
  page text,
  element text,
  feature text,
  duration_ms integer,
  status integer,
  route text,
  error_kind text,
  error_fingerprint text,
  error_message text,
  PRIMARY KEY (env, event_id)
) PARTITION BY LIST (env);

CREATE TABLE events_dev PARTITION OF events FOR VALUES IN ('dev');
CREATE TABLE events_recette PARTITION OF events FOR VALUES IN ('recette');
CREATE TABLE events_prod PARTITION OF events FOR VALUES IN ('prod');

CREATE INDEX events_env_time ON events (env, occurred_at);
CREATE INDEX events_env_type_time ON events (env, type, occurred_at);
CREATE INDEX events_env_route_time ON events (env, route, occurred_at) WHERE route IS NOT NULL;
CREATE INDEX events_env_fp_time ON events (env, error_fingerprint, occurred_at)
  WHERE error_fingerprint IS NOT NULL;
CREATE INDEX events_env_user ON events (env, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX events_env_session ON events (env, session, occurred_at) WHERE session IS NOT NULL;
CREATE INDEX events_env_visitor ON events (env, visitor, occurred_at) WHERE visitor IS NOT NULL;

-- Daily aggregates survive raw retention.
CREATE TABLE daily_route_stats (
  env text NOT NULL CHECK (env IN ('dev', 'recette', 'prod')),
  day date NOT NULL,
  route text NOT NULL,
  requests integer NOT NULL,
  errors integer NOT NULL,
  p50_ms double precision,
  p95_ms double precision,
  PRIMARY KEY (env, day, route)
);

CREATE TABLE daily_feature_usage (
  env text NOT NULL CHECK (env IN ('dev', 'recette', 'prod')),
  day date NOT NULL,
  feature text NOT NULL,
  users integer NOT NULL,
  uses integer NOT NULL,
  PRIMARY KEY (env, day, feature)
);

CREATE TABLE incidents (
  id bigserial PRIMARY KEY,
  env text NOT NULL CHECK (env IN ('dev', 'recette', 'prod')),
  key text NOT NULL,
  status text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  kinds text[] NOT NULL,
  routes text[] NOT NULL,
  pages text[] NOT NULL,
  features text[] NOT NULL,
  fingerprints text[] NOT NULL,
  segments jsonb NOT NULL,
  triggers jsonb NOT NULL,
  app_version text,
  since_version text,
  resolved_version text,
  first_seen timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  replay jsonb,
  issue_ref text,
  history jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incidents_env_key ON incidents (env, key, last_seen DESC);
CREATE INDEX incidents_env_status ON incidents (env, status, last_seen DESC);

-- Persona sets record both where the data came from and where Figura runs.
CREATE TABLE persona_sets (
  id bigserial PRIMARY KEY,
  env text NOT NULL CHECK (env IN ('dev', 'recette', 'prod')),
  target_env text NOT NULL CHECK (target_env IN ('dev', 'recette')),
  payload jsonb NOT NULL,
  accepted integer,
  pushed_by text NOT NULL,
  pushed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX persona_sets_env ON persona_sets (env, pushed_at DESC);

CREATE TABLE sso_jti (
  jti text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  operator text NOT NULL,
  operator_name text,
  action text NOT NULL,
  env text CHECK (env IN ('dev', 'recette', 'prod')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
