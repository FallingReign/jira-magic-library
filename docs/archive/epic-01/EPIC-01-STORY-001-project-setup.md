# E1-S01: Project Setup & TypeScript Config

**Epic**: Epic 1 - Basic Issue Creation  
**Size**: Small (3 points)  
**Priority**: P0  
**Status**: ✅ Done  
**Assignee**: GitHub Copilot  
**Started**: 2025-10-02  
**Completed**: 2025-10-02  
**PR**: Direct commits ([4e27a4d](https://github.com/FallingReign/jira-magic-library/commit/4e27a4d), [8f9b6b3](https://github.com/FallingReign/jira-magic-library/commit/8f9b6b3))

---

## User Story

**As a** developer  
**I want** a well-structured TypeScript project with proper tooling  
**So that** I can develop the library with type safety and modern JavaScript features

---

## Acceptance Criteria

### ✅ AC1: Project Structure Created
- [x] Create directory structure:
  - **Evidence**: See `/src`, `/tests`, `/docs` in repo ([4e27a4d](https://github.com/FallingReign/jira-magic-library/commit/4e27a4d))
  ```
  /src
    /config
    /client
    /schema
    /converters
    /operations
    /errors
    /types
    /utils
  /tests
    /unit
    /integration
    /fixtures
  /docs
  ```

### ✅ AC2: Package.json Configured
- [x] Package name: `jira-magic-library`
  - **Evidence**: `package.json` ([4e27a4d](https://github.com/FallingReign/jira-magic-library/commit/4e27a4d))
- [x] Initial version: `0.1.0`
- [x] License: `MIT`
- [x] Node.js engine: `>=18.0.0`
- [x] Main entry: `dist/index.js`
- [x] Types entry: `dist/index.d.ts`
- [x] Scripts defined:
  - `build`: Compile TypeScript to `dist/`
  - `test`: Run Jest tests
  - `test:unit`: Run unit tests only
  - `test:integration`: Run integration tests only
  - `lint`: Run ESLint
  - `format`: Run Prettier

### ✅ AC3: TypeScript Configured
- [x] `tsconfig.json` created with:
  - **Evidence**: `tsconfig.json` ([4e27a4d](https://github.com/FallingReign/jira-magic-library/commit/4e27a4d))
  - Target: `ES2022`
  - Module: `NodeNext`
  - Strict mode enabled (`strict: true`)
  - Source maps enabled
  - Declaration files enabled
  - Output directory: `dist/`
  - Include: `src/**/*`
  - Exclude: `node_modules`, `dist`, `tests`

### ✅ AC4: Development Tools Configured
- [x] ESLint configured:
  - **Evidence**: `.eslintrc.json`, `package.json` ([4e27a4d](https://github.com/FallingReign/jira-magic-library/commit/4e27a4d))
  - TypeScript parser
  - Recommended rules
  - No unused vars, no console.log in production code
- [x] Prettier configured:
  - Single quotes
  - 2 space indent
  - Trailing commas
  - 100 character line width
- [x] Jest configured:
  - TypeScript support (ts-jest)
  - Coverage thresholds: 95% branches, lines, functions
  - Test environment: Node
  - Test match: `**/*.test.ts`

### ✅ AC5: Git Configuration
- [x] `.gitignore` includes:
  - **Evidence**: `.gitignore` ([4e27a4d](https://github.com/FallingReign/jira-magic-library/commit/4e27a4d))
  - `node_modules/`
  - `dist/`
  - `.env`
  - `*.log`
  - `.DS_Store`
  - Coverage reports

### ✅ AC6: Initial Files Created
- [x] `src/index.ts` with empty export
  - **Evidence**: `src/index.ts` ([4e27a4d](https://github.com/FallingReign/jira-magic-library/commit/4e27a4d))
- [x] `src/types/index.ts` with placeholder types
- [x] `tests/setup.ts` for test configuration
- [x] `README.md` (can reference existing)
- [x] `LICENSE` file (MIT)

### ✅ AC7: Build & Test Pass
- [x] `npm install` completes successfully
  - **Evidence**: `package-lock.json` exists, project builds ([4e27a4d](https://github.com/FallingReign/jira-magic-library/commit/4e27a4d))
- [x] `npm run build` produces `dist/` directory
- [x] `npm run lint` passes with no errors
- [x] `npm run test` runs (no tests yet, but framework works)

---

## Technical Notes

### Dependencies to Install
**Dev Dependencies**:
```json
{
  "@types/node": "^20.x",
  "@typescript-eslint/eslint-plugin": "^6.x",
  "@typescript-eslint/parser": "^6.x",
  "eslint": "^8.x",
  "jest": "^29.x",
  "prettier": "^3.x",
  "ts-jest": "^29.x",
  "typescript": "^5.x"
}
```

**Production Dependencies**: None yet (will be added in subsequent stories)

### Architecture Prerequisites
- None (this is the foundation)

---

## Testing Strategy

### Unit Tests
- Created placeholder test suite (`tests/unit/setup.test.ts`)
- Verified Jest framework configuration works correctly
- Tests confirm TypeScript compilation and imports work

### Test Coverage
- Framework configured for 95% coverage thresholds
- Coverage reporting set up with text, lcov, and html formats
- No coverage requirements for this foundational story (no production logic yet)

### Validation Tests
- ✅ `npm run build` - Verifies TypeScript compilation
- ✅ `npm run lint` - Verifies ESLint configuration
- ✅ `npm run type-check` - Verifies TypeScript type checking
- ✅ `npm run format:check` - Verifies Prettier configuration
- ✅ `npm test` - Verifies Jest test framework

---

## Definition of Done

- [x] All acceptance criteria met
- [x] Code compiles without errors or warnings
- [x] ESLint and Prettier pass
- [x] Directory structure matches specification
- [x] `npm run build` produces valid JavaScript in `dist/`
- [x] Test framework is functional (even if no tests exist yet)
- [x] Git repository initialized with proper `.gitignore`

---

## Implementation Hints

1. Use `npm init` to create initial `package.json`
2. Install TypeScript first: `npm install -D typescript @types/node`
3. Initialize TypeScript config: `npx tsc --init` (then customize)
4. Install and configure ESLint: `npm init @eslint/config`
5. Install Jest and ts-jest: `npm install -D jest ts-jest @types/jest`
6. Create directory structure with `mkdir -p` commands
7. Test the build pipeline before marking complete

---

## Related Stories

- **Depends On**: None
- **Blocks**: All other Epic 1 stories
- **Related**: None

---

## Notes

- This story establishes the foundation for all subsequent development
- TypeScript strict mode enforces type safety from day one
- High coverage thresholds (95%) ensure quality
- Modern Node.js features (18+) allow use of native fetch, ESM, etc.
