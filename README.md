# JIRA Magic Library (JML)

Schema-aware helpers for working with the JIRA Server/Data Center REST API. JML converts human-readable payloads into API-ready requests, validates data against live schema metadata, and includes demos for parsing/validation/bulk retries.

---

## Contents

1. [Overview](#overview)
2. [Compatibility](#compatibility)
3. [Installation](#installation)
4. [Quick Examples](#quick-examples)
5. [Configuration](#configuration)
6. [Demos & Scripts](#demos--scripts)
7. [Development](#development)
8. [Guides](#guides)
9. [Reference Docs](#reference-docs)

---

## Overview

What you get today:

- **Schema discovery & caching** – Loads `/createmeta` for your project/issue type and caches results in Redis (15‑minute TTL).
- **Human-readable input** – Accept CSV/JSON/YAML with column headers like `Project`, `Issue Type`, `Summary`, etc. The parser normalizes formats and number/date/string representations.
- **Schema-only validation** – Call `jml.validate()` (story E4-S07) to catch missing required fields, type mismatches, enum violations, and invalid project/issue type combinations without touching the JIRA API.
- **Bulk create workflow** – Unified `create()` entry point supports single objects, arrays, or files. Manifest storage (Epic 4) tracks successes/failures and enables retries.
- **Demo app** – Interactive CLI under `demo-app/` showcases parsing, validation, bulk create, and manifest retry flows.

---

## Compatibility

| Component | Version / Notes |
|-----------|-----------------|
| **Node.js** | 18.x or later (ESM + native fetch). |
| **JIRA** | Server/Data Center REST API v2. (Cloud support is on the roadmap but not implemented.) |
| **Redis** | Required. Used for schema caching, manifest storage, and rate limit buffers. Any Redis 6/7-compatible deployment works (`redis:7-alpine` works great for dev). |
| **OS** | Developed/tested on macOS + Linux containers. Windows works via WSL or PowerShell (the demo scripts are cross-platform). |

---

## Installation

### 1. Clone & Build the Library

```bash
git clone https://github.com/FallingReign/jira-magic-library.git
cd jira-magic-library
npm install
npm run build        # outputs dist/ for consumption
```

> Tip: Start a local Redis while developing: `docker run -d --name jml-redis -p 6379:6379 redis:7-alpine`

### 2. Consume from Another Project

Since the package is not on npm yet, reference the Git repo directly (or via local path/tarball).

#### Option A: Git dependency

```jsonc
// your-project/package.json
{
  "dependencies": {
    "jira-magic-library": "git+https://github.com/FallingReign/jira-magic-library.git#v1.0.0"
  }
}
```

Then run `npm install` in your project.

#### Option B: Local path

```bash
cd /path/to/your-project
npm install /path/to/jira-magic-library
```

Rebuild the library (`npm run build`) whenever you pull new changes before reinstalling.

---

## Quick Examples

### Load env + create JML instance

```ts
import 'dotenv/config';
import { JML } from 'jira-magic-library';

const jml = new JML({
  baseUrl: process.env.JIRA_BASE_URL!,
  auth: { token: process.env.JIRA_TOKEN! },
  redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
});
```

### Parse and Validate

```ts
const result = await jml.validate({
  data: [
    { Project: 'PROJ', 'Issue Type': 'Task', Summary: 'Prepare sprint board' },
    { Project: 'PROJ', 'Issue Type': 'Bug', Summary: '' } // missing summary
  ],
});

if (!result.valid) {
  console.table(result.errors);
  process.exit(1);
}
```

### Bulk Create with Manifest Retry

```ts
const manifestRun = await jml.issues.create({
  from: './issues.csv', // any format supported by InputParser
  manifest: { prefix: 'import-2025-11-19' },
});

if (manifestRun.failed > 0) {
  console.log('Fix the rows and retry with manifest: ', manifestRun.manifest.id);
  const retry = await jml.issues.create(updatedRows, { retry: manifestRun.manifest.id });
  console.log('Second attempt results:', retry.summary);
}
```

---

## Configuration

All configuration flows through the `JML` constructor. Required fields are marked with **\***.

| Option | Description |
|--------|-------------|
| `baseUrl` **\*** | Base URL of your JIRA/DC instance (e.g. `https://jira.example.com`). |
| `auth.token` **\*** | PAT or session token with permissions to read schema and create issues. |
| `apiVersion` | `v2` (default) – configurable for future support. |
| `redis.url` **\*** | Redis connection string (`redis://user:pass@host:port/db`). |
| `redis.tls` | Set to `true` with certificate options for TLS-enabled Redis. |
| `cache.ttlSeconds` | Override schema cache TTL (default 900s). |
| `manifest.ttlSeconds` | TTL for bulk manifest entries (default 86,400s). |
| `ambiguityPolicy.user` | Handling for ambiguous user lookups (`first` default, `error`, `score`). |

### Environment Variables

You can load values via `.env` in the consuming project:

```
JIRA_BASE_URL=https://jira.example.com
JIRA_TOKEN=examplePAT
REDIS_URL=redis://localhost:6379
```

Make sure `dotenv` (or your config loader) runs *before* instantiating JML.

### User Ambiguity Policy

User lookups can now be tuned per workflow:

- `first` (default): return the first candidate when multiple results match (ideal for tooling and automation).
- `error`: preserve legacy behavior by throwing `AmbiguityError` on duplicates.
- `score`: pick the highest-confidence candidate based on how closely each result matched.

Configure via code:

```ts
const jml = new JML({
  baseUrl: process.env.JIRA_BASE_URL!,
  auth: { token: process.env.JIRA_PAT! },
  ambiguityPolicy: { user: 'score' },
});
```

Or via environment variable (used by `loadConfig()`):

```
JIRA_USER_AMBIGUITY_POLICY=score
```

---

## Demos & Scripts

The `demo-app/` showcases how the library behaves end-to-end.

```bash
cd demo-app
npm install
npm run demo          # interactive menu
```

Notable demos:

- **Schema Validation** – Run validation across CSV/JSON/YAML without creating issues.
- **Bulk Import** – Parse data, create issues, inspect manifests, and retry failed rows.

Each demo reads the main repo’s `.env` / config manager, so ensure those values point to a safe test project.

---

## Guides

- [Guides index](docs/guides/README.md)
- [Validate before create](docs/guides/validate-before-create.md)
- [Parse CSV / JSON / YAML](docs/guides/parsing-input.md)
- [Bulk create with manifest + retry](docs/guides/bulk-manifest-retry.md)
- [Troubleshooting & common errors](docs/guides/troubleshooting.md)

