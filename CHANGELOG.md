# Changelog

All notable changes to this project are documented here. Only tagged releases are listed.

## [1.7.2] - 2026-02-19

### Fixed
- **Excessive console logging during bulk operations** - Reduced terminal spam from hundreds of log lines to silent operation (unless errors occur)
  - Cache refresh logs (`[CACHE] Starting refresh`, `Refresh complete`) now only output when `debug: true`
  - Converter warnings (`No converter for type 'any'`) now only output when `debug: true`
  - User cache status logs (`📦 [UserCache] HIT`) removed entirely (redundant with cache layer logging)
  - Cache refresh failures still always log warnings (error visibility preserved)
  - 88-issue bulk operation: Hundreds of repetitive logs → Clean console output

### Changed
- `RedisCache` constructor now accepts optional `debug` parameter (defaults to `false`)
- `ConverterRegistry` constructor now accepts optional `debug` parameter (defaults to `false`)
- Cache and converter logging behavior now respects `config.debug` setting

## [1.7.1] - 2026-02-19

### Fixed
- **HTTP timeout conflict with progress tracking** - Bulk operations now complete successfully even when progress is slow
  - HTTP timeout automatically disabled when `onProgress` callback is provided
  - Operations can run indefinitely (hours/days) as long as progress continues
  - Progress-based timeout (120s since last issue) remains as safety mechanism
  - Fixes issue where large bulk operations timed out despite making continuous progress

### Changed
- HTTP timeout behavior for progress-tracked operations uses `Infinity` internally
- Enhanced `TimeoutConfig` documentation to clarify automatic timeout behavior

## [1.7.0] - 2026-02-13

### Added
- **Progress Tracking for Bulk Operations** - Real-time progress monitoring during long-running bulk operations
  - New `onProgress` callback receives progress updates during bulk operations
  - Progress-based timeout monitoring tracks time since last issue created
  - Automatic label marker injection and cleanup for progress detection
  - Configurable via `timeout.progressTimeout`, `timeout.progressPolling`, `timeout.cleanupMarkers`
  - Works with both flat and hierarchical bulk operations
- **Issue Search API with Raw JQL Support** - Flexible search with dual-mode operation
  - New `jml.issues.search()` method for searching issues
  - **Raw JQL mode**: Pass `jql` parameter for full control (`jql: "project = PROJ AND cf[10306] = value"`)
  - **Object mode**: Pass field names/values for simple queries
  - Supports custom fields, complex operators, and advanced JQL logic
  - Date filtering with `createdSince`, customizable limits and ordering

### Changed
- `IssueOperations.createBulkHierarchy` now accepts optional `options` parameter for progress tracking
- Progress tracking enabled by default, disable via `timeout.cleanupMarkers: false`
- `IssuesSearchOptions` interface supports `jql?: string` for raw queries

## [1.6.0] - 2025-02-12

### Added
- **Configurable HTTP timeouts** - New `timeout` configuration option for fine-grained control over request timeouts
  - `timeout.default` - Default timeout for all requests (10s default)
  - `timeout.bulk` - Timeout for bulk operations (30s default, up from 10s)
  - `timeout.single` - Timeout for single issue creation (10s default)
  - Per-request timeout overrides available on all HTTP methods
  - Fully backwards compatible - no configuration required
- 22 comprehensive unit tests for timeout configuration covering all edge cases and backwards compatibility

### Changed
- **Bulk operations now default to 30 seconds** (up from 10s) - Provides immediate relief for slow JIRA instances or large bulk operations without configuration

## [1.5.1] - 2025-12-10

### Fixed
- **Project matching bug when name equals key** - Fixed edge case where projects with identical name and key (e.g., 'HELP') caused duplicate entries leading to false "ambiguous match" errors
- **Project lookup optimization** - Eliminated unnecessary data transformation; now uses JIRA project objects directly in native format (`{id, key, name}`)
- **Enhanced project matching** - Added support for matching projects by JIRA's internal ID field (e.g., '10001') in addition to key and name

### Changed
- Simplified project resolution logic to pass JIRA data through unchanged, improving maintainability and reducing edge cases

## [1.5.0] - 2025-12-08

### Added
- **Custom block syntax for multiline content** - New `<<<` / `>>>` delimiters for embedding multiline content without manual escaping
  - Supported in YAML, JSON, and CSV formats
  - Format-specific handling: YAML/JSON convert newlines to `\n` escape sequences, CSV preserves actual newlines per RFC 4180
  - Preserves line endings (CRLF/LF/CR) automatically
  - Trims only empty first/last lines, preserves internal whitespace exactly
  - Works with both bare blocks (`<<<content>>>`) and quoted blocks (`"<<<content>>>"`)
- **Unified debug logging infrastructure** - Comprehensive logging system for troubleshooting library behavior
  - New `debug.enabled` and `debug.namespaces` config options
  - Logs cache operations, HTTP requests, field resolution, conversions, and more
  - Zero overhead when disabled (fast path optimization)
- New `preprocessCustomBlocks` export for direct access to custom block preprocessing
- New `preprocessCustomBlocks?: boolean` option in InputParser config (default: `true`)

### Changed
- **Enhanced workflow validator** - Now recognizes documented coverage exceptions in story files
- InputParser preprocessing pipeline now runs custom block preprocessing before quote preprocessing

### Fixed
- **Quote preprocessor TypeScript error** - Fixed unused function warning in quote-preprocessor.ts

## [1.4.1] - 2025-12-08

### Fixed
- **Quote preprocessor handles content that looks like YAML keys** - Fixed multiline quote detection to correctly identify closing quotes when content inside quoted values contains patterns like `Keys:`, `Links:`, or `Manifest:` that look like YAML keys but are actually part of the value content (common in Slack variable replacements)

## [1.4.0] - 2025-12-07

### Added
- **Automatic quote preprocessing** - Library automatically escapes unescaped quotes in YAML, JSON, and CSV input before parsing
- New `preprocessQuotes` and `preprocessQuotesWithDetails` exports for direct access to preprocessing
- New `preprocessQuotes?: boolean` config option to enable/disable preprocessing (default: `true`)
- Handles multiline values, code blocks, markdown content with embedded quotes
- Preserves line ending style (CRLF/LF/CR) during preprocessing

### Changed
- InputParser now preprocesses all input transparently before parsing
- Debug logging when preprocessing modifies input: `"Input required quote preprocessing for {format} format"`

## [1.3.1] - 2025-12-06

### Added
- **New cascading select delimiters** - Support `>` and `|` as delimiters (e.g., `"Design > Level"`, `"Design | Level"`)
- **Fallback delimiter detection** - Automatically split on any single non-alphanumeric separator group when standard delimiters aren't used (e.g., `"Design - Level"`, `"Product Design & Level One"`)
- **Ambiguity detection** - Helpful error messages when input has multiple potential split points (e.g., `"Product-Design - Level-One"`)

### Fixed
- **Cascading select with hyphens** - Values like `"Design - Level"` now correctly resolve to parent/child instead of failing with "not found"

## [1.3.0] - 2025-12-05

### Added
- **Fuzzy user matching** - Typos like "Jon Smith" now resolve to "John Smith" automatically
- New `fuzzyMatch.user.enabled` config option (default: `true`)
- New `fuzzyMatch.user.threshold` config option (0.0-1.0, default: `0.3`)
- Fuzzy matching works with displayName, email, and username fields
- Integrated with existing ambiguity policies (`first`, `error`, `score`)

### Changed
- User matching now falls back to fuzzy matching when exact match fails
- Performance: fuzzy matching over 10k users completes in <500ms

## [1.2.1] - 2025-12-03

### Fixed
- FieldResolver now resolves project/issueType using fuzzy matching against JIRA data
- Projects can be specified by name (e.g., `"Engineering"`) in addition to key
- Issue types are fuzzy matched with typo tolerance (e.g., `"storey"` → `"Story"`)
- Added caching for project list (15 min TTL) to reduce API calls

## [1.2.0] - 2025-12-03

### Added
- Universal `extractFieldValue` utility for consistent JIRA API object format handling
- All lookup converters now accept raw JIRA API formats (e.g., `{ id: "10001" }`, `{ name: "High" }`)

### Changed
- Refactored 8 converters to use shared extraction logic (Option, Priority, Component, Version, User, Project, IssueType, OptionWithChild)

## [1.1.5] - 2025-12-03

### Fixed
- UserConverter now resolves `{ name: ... }` objects instead of passing through

## [1.1.4] - 2025-12-03

### Changed
- Optimized timestamp generation in bulk manifest creation
- Added passthrough support for raw JIRA API formats in IssueOperations

## [1.1.2] - 2025-12-02

### Fixed
- Ignore blank or null parent values in FieldResolver

## [1.1.1] - 2025-12-01

### Changed
- Enhanced hierarchy level detection with normalized UID/parent references
- Improved API documentation and usage examples

## [1.1.0] - 2025-11-28

### Added
- **Hierarchy bulk import** - Create issues with parent/child relationships using UID references
- Automatic topological sorting for correct creation order
- Circular dependency detection
- Hierarchy-aware retry with UID→key mappings
- Demo-app integration for hierarchy workflows

## [1.0.2] - 2025-11-24

### Changed
- Internal version bump

## [1.0.1] - 2025-11-24

### Changed
- CI improvements for docs publishing

## [1.0.0] - 2025-11-24

### Added
- Initial public release
- Schema discovery and Redis caching
- Human-readable input parsing (CSV/JSON/YAML)
- Field conversion with fuzzy name matching
- Bulk create with manifest tracking and retry support
- Schema-only validation mode
- Interactive demo application
