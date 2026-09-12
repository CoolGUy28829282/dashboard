.PHONY: dev api web scan backfill import fixtures types test check lint post-session screenshots install
PY=backend/.venv/bin/python
UV=uv
export DATA_DIR ?= $(CURDIR)/data

install:
	cd backend && $(UV) venv -q && $(UV) pip install -q -e ".[dev]"
	cd frontend && npm install --silent

dev:
	@$(MAKE) -j2 api web

api:
	cd backend && .venv/bin/uvicorn premarket.api:app --reload --port 8000

web:
	cd frontend && npm run dev

scan:
	cd backend && .venv/bin/premarket scan $(INSTR)

backfill:
	cd backend && .venv/bin/premarket backfill

import:
	cd backend && .venv/bin/premarket import "$(FILE)" --instrument $(INSTR) --interval $(INTERVAL)

fixtures:
	cd backend && .venv/bin/premarket fixtures

post-session:
	cd backend && .venv/bin/premarket post-session $(INSTR)

types:
	cd backend && .venv/bin/premarket types > ../frontend/src/types/snapshot.ts

lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . && .venv/bin/mypy premarket
	cd frontend && npx tsc --noEmit -p tsconfig.json && npx eslint src

test:
	cd backend && .venv/bin/pytest -q
	cd frontend && npx vitest run --reporter=dot

check: lint test
	@echo "check: green"

screenshots:
	cd frontend && node scripts/screenshot.mjs
