/**
 * JIRA Magic Library - Main Entry Point
 *
 * A schema-driven, human-friendly JIRA REST API client for Node.js.
 * Dynamically discovers JIRA metadata and converts readable field names
 * into valid JIRA API payloads.
 *
 * @packageDocumentation
 */

// Main JML class
export { JML } from './jml.js';
export type { JMLConfig } from './types/config.js';

// Configuration
export { loadConfig } from './config/loader.js';

// Error types
export {
  JMLError,
  ValidationError,
  AmbiguityError,
  JIRAApiError,
  ConnectionError,
  AuthenticationError,
  SchemaError,
  CacheError,
  ConversionError,
} from './errors/index.js';

// Types
export type { Issue } from './types/index.js';
export type { HierarchyLevel, HierarchyStructure } from './types/hierarchy.js';

// Hierarchy API
export {
  JPOHierarchyDiscovery,
  getParentLevel,
  isValidParent,
} from './hierarchy/JPOHierarchyDiscovery.js';
export { ParentFieldDiscovery } from './hierarchy/ParentFieldDiscovery.js';

// Parser API (E4-S01)
export { parseInput } from './parsers/InputParser.js';
export type { ParsedInput, ParseInputOptions } from './parsers/InputParser.js';

// Bulk Operations (E4-S02)
export { ManifestStorage } from './operations/ManifestStorage.js';
export type { BulkManifest, BulkResult, ManifestUpdateData } from './types/bulk.js';

// Bulk Operations (E4-S03)
export { JiraBulkApiWrapper } from './operations/JiraBulkApiWrapper.js';
export type { BulkApiResult } from './types/bulk.js';

// Validation API (E4-S07)
export { ValidationService } from './validation/ValidationService.js';
export type { ValidationResult } from './validation/types.js';
export type { ValidationError as ValidationErrorDetail } from './validation/types.js';
export type { ValidationWarning } from './validation/types.js';

// Additional exports needed for demos
export { RedisCache } from './cache/RedisCache.js';
export type { JiraClient } from './client/JiraClient.js';
export { JiraClientImpl } from './client/JiraClient.js';
