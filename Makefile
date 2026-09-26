# Everything runs in Docker: no tool is needed on the host except Docker.
COMPOSE = docker compose
RUN_DEV = $(COMPOSE) --profile test run --rm tests

.PHONY: env up down seed test coverage lint format format-check check verify logs clean

env:            ## create .env from .env.example if missing
	@test -f .env || cp .env.example .env

up: env         ## build and start storage, API, jobs and dashboard
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

seed: env       ## fill the database with the demo dataset
	$(COMPOSE) --profile tools run --rm seed

coverage: env   ## tests with 100 % coverage thresholds (fails below)
	$(RUN_DEV) npm run coverage

test: coverage

lint: env       ## ESLint, zero warnings
	$(RUN_DEV) npm run lint

format: env     ## Prettier, rewrite files
	$(COMPOSE) --profile test run --rm -v "$(CURDIR):/app" -v /app/node_modules tests npm run format

format-check: env
	$(RUN_DEV) npm run format:check

check: env      ## file size, LF, README per folder, no skipped/ignored tests
	$(RUN_DEV) npm run check

verify: env     ## everything the integrator will run: check + lint + format + coverage
	$(RUN_DEV) npm run verify

logs:
	$(COMPOSE) logs -f api jobs

clean:
	$(COMPOSE) down -v
