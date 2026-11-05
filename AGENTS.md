# AGENTS.md

JIRA Magic Library (JML): a schema-driven Node.js library that turns human-friendly input (field names, option labels) into valid Jira payloads for Server/DC and Cloud.

## Stack

- Node.js 18+, ESM, TypeScript (`src/`, built to `dist/`)
- Native `fetch` (no axios)
- Redis-backed cache for schema, lookups and bulk manifests

## Commands

```bash
npm run build            # tsc
npm test                 # unit tests
npm run test:coverage    # coverage gate: 95% lines/branches/statements, 94% functions
npm run test:integration # needs a real Jira; copy .env.test.example to .env.test
npm run lint
npm run type-check
npm run redis:run        # local Redis in Docker
npm run install:hooks    # PII pre-commit hook
```

## Layout

- `src/`: library code (converters, discovery, operations, parsers, resolution, validation)
- `tests/unit/` mirrors `src/`; `tests/integration/` runs against a real Jira
- `demo-app/`: interactive demo. Imports from `jira-magic-library`, never from `src/`. See `demo-app/README.md`.
- `docs/architecture/system-architecture.md`: design decisions
- `docs/guides/`: user guides

## Rules

- Converters are type-based (by Jira field schema type), not field-based. Never hard-code field or option IDs.
- Keep test coverage at or above the thresholds in `jest.config.cjs`.
- Never commit PII or credentials. The pre-commit hook blocks PII; don't bypass it.
- Releases: use the `release` skill (`.github/skills/release/SKILL.md`).
