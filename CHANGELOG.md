# Changelog

All notable changes to this project are documented here. Only tagged releases are listed.

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
