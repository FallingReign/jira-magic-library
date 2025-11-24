# JML Examples

Practical examples showing how to use the JIRA Magic Library.

## Prerequisites

Before running any examples:

1. **Create `.env` file** in project root:
   ```bash
   JIRA_BASE_URL=https://jira.your-company.com
   JIRA_PAT=your-personal-access-token
   JIRA_PROJECT_KEY=PROJ
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start Redis** (optional but recommended):
   ```bash
   npm run redis:start
   ```

## Available Examples

### 1. Validate Connection
**What it shows:** Testing connection to JIRA before making requests  
**Run:** `npm run example:validate-connection`  
**Expected:** Server info displayed (version, deployment type)

**Use case:** Always validate connection first to catch auth/network issues early.

---

### 2. Create a Bug
**What it shows:** Creating a simple bug report with minimum required fields  
**Run:** `npm run example:create-bug`  
**Expected:** Bug created in JIRA, issue key returned

**Use case:** Basic issue creation workflow.

---

### 3. Error Handling
**What it shows:** How to catch and handle different error types  
**Run:** `npm run example:error-handling`  
**Expected:** 
- ValidationError caught for invalid project
- ValidationError caught for missing required field
- Connection test passes

**Use case:** Production-ready error handling.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **"Cannot find module '../src'"** | Run `npm run build` first |
| **"Unauthorized" error** | Check JIRA_PAT in .env is valid |
| **"Project not found"** | Update JIRA_PROJECT_KEY in .env |
| **Redis connection warning** | Start Redis: `npm run redis:start` |

## Adding Your Own Examples

1. Create `examples/my-example.ts`
2. Use the shared `getConfig()` helper from `examples/config.ts`
3. Add npm script: `"example:my-example": "ts-node examples/my-example.ts"`
4. Document it in this README

## Tips

- 💡 **Always call `jml.validateConnection()`** before making requests
- 💡 **Always call `jml.disconnect()`** when done to close Redis connection
- 💡 **Use try/catch** and handle specific error types
- 💡 **Check error.details** for additional debugging info
