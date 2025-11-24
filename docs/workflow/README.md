# Workflow Guide

**Purpose**: Step-by-step guides for planning epics and implementing stories in the JIRA Magic Library.

---

## Two Workflows

This project uses **two complementary workflows**:

### 1. Planning Workflow (Epic → Stories)
**Before development begins**, use the [Planning Workflow](planning/README.md) to:
- Select next epic from backlog
- Refine epic with user (incorporate learnings)
- Create detailed story files
- Get user approval before development

**See**: [Planning Workflow Guide](planning/README.md)

### 2. Development Workflow (Story → Implementation)
**After stories are approved**, use this workflow to implement each story through 4 phases.

---

## Development Workflow: The 4 Phases

Every story follows these 4 phases:

### [1. Planning](1-planning.md)
**Duration**: 15-30 minutes  
**Goal**: Understand requirements and context

- Pick a story (dependencies met)
- Update state (📋 → ⏳)
- Read architecture + story + dependencies

### [2. Implementation](2-implementation.md)
**Duration**: 2-8 hours  
**Goal**: Write tests and code

- Write tests FIRST (TDD)
- Implement code (architectural rules)
- Run tests (unit + integration)

### [3. Validation](3-validation.md) ⭐ **MOST IMPORTANT**
**Duration**: 15-30 minutes  
**Goal**: Verify ALL acceptance criteria met

- 5-step AC verification (per AC)
- Run all validation commands
- Check coverage (≥95% or documented exception)

### [4. Review & Completion](4-review.md)
**Duration**: 15-30 minutes  
**Goal**: Finalize and mark Done

- Update documentation (TSDoc, API docs)
- Create demo (if user-facing)
- Commit work (PR or direct)
- Update state (⏳ → ✅ Done)

---

## Prerequisites ⚠️

Before starting any story, ensure Redis is running:

```bash
npm run redis:start   # Start Redis in Docker
docker exec jml-redis redis-cli ping      # Verify (should return "PONG")
```

**Required for**: Schema caching, integration tests, demos

---

## Usage

### For New Stories

Start at Phase 1 and work through sequentially:

```bash
# Phase 1: Planning
docs/workflow/1-planning.md

# Phase 2: Implementation
docs/workflow/2-implementation.md

# Phase 3: Validation
docs/workflow/3-validation.md

# Phase 4: Review
docs/workflow/4-review.md
```

### For Checkpoints

If agent completes implementation but forgets validation:

```
User: "Now follow docs/workflow/3-validation.md"
```

If agent completes validation but forgets to update status:

```
User: "Now follow docs/workflow/4-review.md"
```

---

## Reference Documentation

For detailed technical guidance, see:

- **[Planning Workflow](planning/README.md)** - How to take epics from backlog and create story files
- **[AGENTS.md](../../AGENTS.md)** - Complete development workflow, file conventions, git workflow
- **[System Architecture](../architecture/system-architecture.md)** - Architectural rules, technology constraints, design patterns
- **[Backlog](../backlog.md)** - Story status tracking and epic progress

---

## Quick Reference

### Phase Checklist

- [ ] **Phase 1**: Planning ✅
  - Story picked, status updated, context read
- [ ] **Phase 2**: Implementation ✅
  - Tests written, code implemented, tests passing
- [ ] **Phase 3**: Validation ✅ ⭐
  - All ACs verified, validation commands passed
- [ ] **Phase 4**: Review ✅
  - Docs updated, demo created (if needed), status updated to ✅ Done

### Commands

```bash
# Find ready stories
grep -r "📋 Ready" docs/stories/

# Run validation
npm run validate:workflow

# Run tests
npm test
npm run test:coverage
npm run test:integration

# Run demo
npm run demo:{STORY-ID}
```

---

## Problem: Agent Skips Phases

**Symptom**: Agent implements code but forgets to validate ACs.

**Solution**: Use checkpoint-based prompting:

```
After implementation:
User: "Now follow docs/workflow/3-validation.md"

After validation:
User: "Now follow docs/workflow/4-review.md"
```

**Benefit**: Smaller context (1500 lines vs 9500 lines), focused instructions.

---

## See Also

- **[AGENTS.md](../../AGENTS.md)** - Overview and quick reference
- **[backlog.md](../backlog.md)** - Available stories
- **[Architecture](../architecture/system-architecture.md)** - System design
