import { JiraClient } from '../client/JiraClient.js';
import { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import { FieldResolver } from '../converters/FieldResolver.js';
import { ConverterRegistry } from '../converters/ConverterRegistry.js';
import { Issue } from '../types/index.js';
import { BulkResult, BulkManifest } from '../types/bulk.js';
import { LookupCache, GenericCache } from '../types/converter.js';
import type { JMLConfig, AmbiguityPolicyConfig, FuzzyMatchConfig } from '../types/config.js';
import { parseInput, ParseInputOptions } from '../parsers/InputParser.js';
import { ManifestStorage } from './ManifestStorage.js';
import { JiraBulkApiWrapper } from './JiraBulkApiWrapper.js';
import { RedisCache } from '../cache/RedisCache.js';
import { UidReplacer } from './bulk/UidReplacer.js';
import type { HierarchyLevel } from './bulk/HierarchyLevels.js';
import { preprocessHierarchyRecords } from './bulk/HierarchyPreprocessor.js';

/**
 * Input supported by {@link JML.issues | `jml.issues.create`}.
 *
 * Callers can pass a single object, an array, or {@link ParseInputOptions}
 * describing CSV/JSON/YAML payloads that should be parsed before creation.
 */
export type IssuesCreateInput = 
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | ParseInputOptions;

/**
 * Options supported by {@link JML.issues | `jml.issues.create`}.
 */
export interface IssuesCreateOptions {
  /**
   * Run converters + validation without calling JIRA.
   * Returns the converted payload with DRY-RUN markers.
   */
  validate?: boolean;
  /**
   * Resume a previous manifest run by ID. When provided, only failed rows
   * are retried and merged into the original manifest.
   */
  retry?: string;
  /**
   * Per-call ambiguity policy override.
   * Merges with instance-level config, with per-call taking precedence.
   * @example { user: 'error' }
   */
  ambiguityPolicy?: AmbiguityPolicyConfig;
  /**
   * Per-call fuzzy matching override.
   * Merges with instance-level config, with per-call taking precedence.
   * @example { user: { enabled: true, threshold: 0.3 } }
   */
  fuzzyMatch?: FuzzyMatchConfig;
}

/**
 * Thin interface describing the public surface exposed as `jml.issues`.
 * This keeps the docs focused on what consumers can call without surfacing
 * every internal helper on {@link IssueOperations}.
 */
export interface IssuesAPI {
  /**
   * Create one or more issues using human-readable payloads.
   *
   * - Accepts either a single row, an array of rows, or {@link ParseInputOptions}
   *   pointing at CSV/JSON/YAML data.
   * - Automatically batches hierarchies level-by-level (story E4-S13) so a full
   *   Program → Epic → Story → Sub-task tree can be passed in a single payload.
   * - Stores a manifest for every bulk run that can be retried via the `retry`
   *   option without recreating successful rows.
   *
   * @param input - Single object, array of objects, or {@link ParseInputOptions}.
   * @param options - Optional flags for dry-run validation and manifest retry.
   * @returns The created {@link Issue} for single rows or a {@link BulkResult}.
   */
  create(
    input: IssuesCreateInput,
    options?: IssuesCreateOptions
  ): Promise<Issue | BulkResult>;
}

/**
 * Issue operations for creating, updating, and managing JIRA issues
 * 
 * E4-S04: Unified create() method supports both single and bulk creation
 */
export class IssueOperations implements IssuesAPI {
  private manifestStorage?: ManifestStorage;
  private bulkApiWrapper?: JiraBulkApiWrapper;

  constructor(
    private client: JiraClient,
    private schema: SchemaDiscovery,
    private resolver: FieldResolver,
    private converter: ConverterRegistry,
    private cache?: LookupCache,
    private baseUrl?: string,
    private config?: JMLConfig
  ) {
    // Initialize bulk operation dependencies if cache available
    // Note: LookupCache is always RedisCache at runtime (from JML constructor)
    if (cache) {
      this.manifestStorage = new ManifestStorage(cache as unknown as RedisCache);

      // Pass bulk timeout from config to wrapper (default 30s if not configured)
      const bulkTimeout = this.config?.timeout?.bulk;
      this.bulkApiWrapper = new JiraBulkApiWrapper(client, bulkTimeout);
    }
  }

  /**
   * Merge per-call config overrides with instance config
   * 
   * Per-call options take precedence over instance config.
   * Nested objects (ambiguityPolicy, fuzzyMatch) are merged shallowly.
   * 
   * @param options - Per-call options with optional config overrides
   * @returns Merged config for converter context
   * @private
   */
  private mergeConfig(options?: IssuesCreateOptions): JMLConfig | undefined {
    if (!options?.ambiguityPolicy && !options?.fuzzyMatch) {
      return this.config; // No overrides, use instance config as-is
    }

    return {
      ...this.config,
      // Shallow merge ambiguityPolicy (per-call takes precedence)
      ambiguityPolicy: options.ambiguityPolicy 
        ? { ...this.config?.ambiguityPolicy, ...options.ambiguityPolicy }
        : this.config?.ambiguityPolicy,
      // Shallow merge fuzzyMatch (per-call takes precedence)  
      fuzzyMatch: options.fuzzyMatch
        ? { ...this.config?.fuzzyMatch, ...options.fuzzyMatch }
        : this.config?.fuzzyMatch,
    } as JMLConfig;
  }

  /**
   * Create JIRA issues from a single record, an array of records, or parsed file input.
   *
   * The implementation mirrors the public `jml.issues.create(...)` surface:
   *
   * - Accepts a single object with `Project` / `Issue Type` fields and returns a single Issue.
   * - Accepts an array of objects (or ParseInputOptions such as `{ from: 'file.csv' }`) and returns a {@link BulkResult}.
   * - Detects uid-based hierarchies produced by {@link preprocessHierarchyRecords} and routes them through level batching (story E4-S13).
   * - Persists a manifest so callers can resume failures via the `retry` option (stories E4-S02/E4-S05).
   *
   * This is the method that powers `jml.issues.create(...)` in the public API.
   *
   * @param input - Single issue object, array of issue objects, or ParseInputOptions.
   * @param options - Optional flags (`validate` for dry-run payload inspection, `retry` for manifest resume).
   * @returns A single Issue when a lone object is provided, otherwise a {@link BulkResult}.
   *
   * @example Create a single issue
   * ```typescript
   * const issue = await issueOps.create({
   *   Project: 'ENG',
   *   'Issue Type': 'Bug',
   *   Summary: 'Login fails'
   * });
   * ```
   *
   * @example Create bulk hierarchy with uid references
   * ```typescript
   * const result = await issueOps.create([
   *   { uid: 'epic-1', Project: 'ENG', 'Issue Type': 'Epic', Summary: 'Parent Epic' },
   *   { uid: 'task-1', Project: 'ENG', 'Issue Type': 'Task', Summary: 'Child Task', Parent: 'epic-1' }
   * ]);
   * // result.manifest.uidMap will map `epic-1`/`task-1` to real keys.
   * ```
   */
  async create(
    input: IssuesCreateInput,
    options?: IssuesCreateOptions
  ): Promise<Issue | BulkResult> {
    // E4-S05: Handle retry with manifest ID
    if (options?.retry) {
      return this.retryWithManifest(input, options.retry, options);
    }

    // Normalize input: unwrap { fields: {...} } and { issues: [...] } formats
    const normalizedInput = this.normalizeInput(input);
    const inputType = this.detectInputType(normalizedInput);

    if (inputType === 'single') {
      // Dispatch to single-issue creation (E1-S09)
      return this.createSingle(normalizedInput as Record<string, unknown>, options);
    }

    // Dispatch to bulk creation (E4-S01, E4-S02, E4-S03)
    return this.createBulk(normalizedInput, options);
  }

  /**
   * Normalize input format to standard JML format
   * 
   * Handles JIRA API formats:
   * - { fields: { project: {...}, ... } } → unwrap to flat object
   * - { issues: [{ fields: {...} }, ...] } → unwrap to array of flat objects
   * 
   * @param input - Original input in any supported format
   * @returns Normalized input for JML processing
   * 
   * @private
   */
  private normalizeInput(input: IssuesCreateInput): IssuesCreateInput {
    if (Array.isArray(input)) {
      return input;
    }

    const obj = input as Record<string, unknown>;

    // Handle { issues: [{ fields: {...} }, ...] } format
    if (obj.issues && Array.isArray(obj.issues)) {
      return (obj.issues as Array<{ fields: Record<string, unknown> }>).map(issue => issue.fields);
    }

    // Handle { fields: { project: {...}, ... } } format
    if (obj.fields && typeof obj.fields === 'object' && obj.fields !== null) {
      const fields = obj.fields as Record<string, unknown>;
      if (fields.project !== undefined) {
        return fields;
      }
    }

    // Return as-is for other formats (ParseInputOptions, flat JML format)
    return input;
  }

  /**
   * Retry bulk creation using existing manifest
   * 
   * Loads the manifest from Redis, filters input to only include failed rows,
   * processes them, then merges results with the original manifest.
   * 
   * @param input - Input data (same format as original create() call)
   * @param manifestId - ID of existing manifest to retry
   * @param _options - Create options (currently unused for retry, reserved for future)
   * @returns Combined BulkResult with original + retry results
   * 
   * @throws {Error} If manifest not found or expired
   * 
   * @private
   */
  private async retryWithManifest(
    input: IssuesCreateInput,
    manifestId: string,
    _options?: IssuesCreateOptions
  ): Promise<BulkResult> {
    // AC1: Load manifest from Redis
    if (!this.manifestStorage || !this.bulkApiWrapper) {
      throw new Error('Bulk operations require cache to be configured');
    }

    const manifest = await this.manifestStorage.getManifest(manifestId);
    if (!manifest) {
      throw new Error(`Manifest ${manifestId} not found or expired`);
    }

    // Warn if manifest is older than 24 hours
    const ageHours = (Date.now() - manifest.timestamp) / (1000 * 60 * 60);
    if (ageHours > 24) {
      console.warn(`⚠️  Manifest is older than 24 hours (${ageHours.toFixed(1)}h old). Data may be stale.`);
    }

    // If no failures remain, return current state immediately
    if (manifest.failed.length === 0) {
      // Build results array from manifest
      const results = [];
      for (let i = 0; i < manifest.total; i++) {
        if (manifest.succeeded.includes(i)) {
          results.push({
            index: i,
            success: true as const,
            key: manifest.created[i]
          });
        }
      }
      
      return {
        total: manifest.total,
        succeeded: manifest.succeeded.length,
        failed: 0,
        manifest,
        results
      };
    }

    // AC2: Parse input and filter to only failed rows
    let inputArray: Array<Record<string, unknown>>;
    if (Array.isArray(input)) {
      inputArray = input;
    } else if (typeof input === 'object' && ('from' in input || 'data' in input)) {
      // Parse from file/string
      const parseResult = await parseInput(input as ParseInputOptions);
      inputArray = parseResult.data;
    } else {
      throw new Error('Retry requires array or parse options input format');
    }

    // Filter to only include rows that previously failed
    const failedRowIndices = manifest.failed;
    const filteredInput = inputArray.filter((_, index) => {
      return failedRowIndices.includes(index);
    });

    // eslint-disable-next-line no-console
    console.log(`🔄 Retrying ${filteredInput.length} failed rows from manifest ${manifestId}`);

    // E4-S13 AC8: Check if this was a hierarchy operation
    // If uidMap exists, route to hierarchy-aware retry
    if (manifest.uidMap && Object.keys(manifest.uidMap).length > 0) {
      return this.retryWithHierarchy(
        filteredInput,
        failedRowIndices,
        manifest
      );
    }

    // AC3: Process filtered rows (same pattern as createBulk)
    // Build JIRA payloads for each filtered record
    const payloadResults = await Promise.allSettled(
      filteredInput.map(async (record, filteredIndex) => {
        try {
          const issue = await this.createSingle(record, { validate: true });
          return {
            index: filteredIndex,
            success: true as const,
            payload: { fields: issue.fields as Record<string, unknown> }
          };
        } catch (error) {
          return {
            index: filteredIndex,
            success: false as const,
            error: error as Error
          };
        }
      })
    );

    // Separate successful payloads from validation failures
    const validPayloads: Array<{ index: number; payload: { fields: Record<string, unknown> } }> = [];
    const validationErrors: Array<{ index: number; error: Error }> = [];

    payloadResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const value = result.value;
        if (value.success) {
          validPayloads.push({ index: value.index, payload: value.payload });
        } else {
          validationErrors.push({ index: value.index, error: value.error });
        }
      } else {
        validationErrors.push({
          index,
          error: new Error(`Unexpected validation failure: ${result.reason}`)
        });
      }
    });

    // Call bulk API with valid payloads
    const apiResult = validPayloads.length > 0
      ? await this.bulkApiWrapper.createBulk(validPayloads.map(vp => vp.payload))
      : { created: [], failed: [] };

    // Remap API results back to original row indices
    const indexMapping = new Map(validPayloads.map((vp, apiIndex) => [apiIndex, vp.index]));
    
    const remappedCreated = apiResult.created.map(item => {
      const filteredIndex = indexMapping.get(item.index) ?? item.index;
      const originalIndex = failedRowIndices[filteredIndex];
      if (originalIndex === undefined) {
        throw new Error(`Failed to map filtered index ${filteredIndex} to original index`);
      }
      return { ...item, index: originalIndex };
    });
    
    const remappedFailed = apiResult.failed.map(item => {
      const filteredIndex = indexMapping.get(item.index) ?? item.index;
      const originalIndex = failedRowIndices[filteredIndex];
      if (originalIndex === undefined) {
        throw new Error(`Failed to map filtered index ${filteredIndex} to original index`);
      }
      return { ...item, index: originalIndex };
    });

    // Remap validation errors to original indices
    const remappedValidationErrors = validationErrors.map(({ index: filteredIndex, error }) => {
      const originalIndex = failedRowIndices[filteredIndex];
      if (originalIndex === undefined) {
        throw new Error(`Failed to map filtered index ${filteredIndex} to original index`);
      }
      return { index: originalIndex, error };
    });

    // AC4 & AC5: Merge results with original manifest
    const updatedManifest: BulkManifest = {
      id: manifest.id, // Same manifest ID
      timestamp: manifest.timestamp, // Preserve original timestamp
      total: manifest.total,
      succeeded: [...manifest.succeeded],
      failed: [...manifest.failed],
      created: { ...manifest.created },
      errors: { ...manifest.errors }
    };

    // Update with retry successes
    remappedCreated.forEach(item => {
      const originalIndex = item.index;
      
      // Add to succeeded list
      if (!updatedManifest.succeeded.includes(originalIndex)) {
        updatedManifest.succeeded.push(originalIndex);
      }
      
      // Remove from failed list
      updatedManifest.failed = updatedManifest.failed.filter(idx => idx !== originalIndex);
      
      // Add issue key
      updatedManifest.created[originalIndex] = item.key;
      
      // Remove error
      delete updatedManifest.errors[originalIndex];
    });

    // Update with retry failures (API-level)
    remappedFailed.forEach(item => {
      updatedManifest.errors[item.index] = { status: item.status, errors: item.errors };
    });

    // Update with validation failures
    remappedValidationErrors.forEach(({ index, error }) => {
      updatedManifest.errors[index] = {
        status: 400,
        errors: { validation: error.message }
      };
    });

    // Store merged manifest back to Redis
    await this.manifestStorage.storeManifest(updatedManifest);

    // Build complete results array (all rows)
    const results = [];
    for (let i = 0; i < manifest.total; i++) {
      if (updatedManifest.succeeded.includes(i)) {
        results.push({
          index: i,
          success: true as const,
          key: updatedManifest.created[i]
        });
      } else if (updatedManifest.failed.includes(i)) {
        const error = updatedManifest.errors[i];
        if (error) {
          results.push({
            index: i,
            success: false as const,
            error: { status: error.status, errors: error.errors }
          });
        }
      }
    }

    // Return combined result
    return {
      total: updatedManifest.total,
      succeeded: updatedManifest.succeeded.length,
      failed: updatedManifest.failed.length,
      manifest: updatedManifest,
      results
    };
  }

  /**
   * Detect whether input is for single or bulk issue creation
   * 
   * Note: Input should be normalized via normalizeInput() before calling this method.
   * 
   * @param input - Normalized input data
   * @returns 'single' for single issue object, 'bulk' for arrays or parse options
   */
  private detectInputType(input: IssuesCreateInput): 'single' | 'bulk' {
    // Array of objects → bulk
    if (Array.isArray(input)) {
      return 'bulk';
    }

    const obj = input as Record<string, unknown>;

    // Parse options (from/data/format) → bulk
    const parseOpts = input as ParseInputOptions;
    if (parseOpts.from || parseOpts.data !== undefined || parseOpts.format) {
      return 'bulk';
    }

    // Single object with Project field → single (JML human-readable format)
    // After normalization, fields.project becomes just project
    if (obj.Project || obj.project) {
      return 'single';
    }

    // Invalid input
    throw new Error('Invalid input format: must have Project field, be an array, or have from/data/format properties');
  }

  /**
   * Create a single JIRA issue (internal method)
   * 
   * This is the original E1-S09 implementation, now refactored as a private method
   * to support the unified create() API in E4-S04.
   * 
   * @param input - Issue data with human-readable field names
   * @param options - Optional settings (validate for dry-run mode, per-call config overrides)
   * @returns Created issue with key, id, and self URL
   * 
   * @throws {Error} If Project or Issue Type is missing
   * @throws {Error} If JIRA API returns an error
   * 
   * @private
   */
  private async createSingle(
    input: Record<string, unknown>,
    options?: IssuesCreateOptions
  ): Promise<Issue> {
    // Strip library-internal fields that shouldn't go to JIRA
    // uid is used for hierarchy tracking in bulk operations
    const { uid: _uid, ...cleanInput } = input;
    
    // Merge per-call config overrides with instance config
    const mergedConfig = this.mergeConfig(options);
    
    // S4: Defer project/issueType extraction to FieldResolver
    // This handles all formats: string, object with key/id, object with name
    // Returns projectKey (for schema lookup), issueType (for schema lookup), 
    // and resolved fields (with project/issuetype already in JIRA format)
    const { projectKey, issueType, fields: resolvedFields } = 
      await this.resolver.resolveFieldsWithExtraction(cleanInput);

    // Get schema for conversion context
    const projectSchema = await this.schema.getFieldsForIssueType(projectKey, issueType);

    // Convert values to JIRA format (await for async converters like priority, user, etc.)
    const convertedFields = await this.converter.convertFields(
      projectSchema,
      resolvedFields,
      { 
        projectKey, 
        issueType, 
        baseUrl: this.baseUrl, 
        cache: this.cache,
        cacheClient: this.cache as unknown as GenericCache, // RedisCache implements both LookupCache and GenericCache
        client: this.client,
        config: mergedConfig // Pass merged config for converter customization (AC8, AC9, per-call overrides)
      }
    );

    // Build JIRA payload
    const payload = {
      fields: convertedFields,
    };

    // Dry-run mode: return payload without API call
    if (options?.validate) {
      return {
        key: 'DRY-RUN',
        id: '0',
        self: '',
        fields: convertedFields,
      };
    }

    // Create issue via JIRA API
    try {
      const response = await this.client.post<Issue>('/rest/api/2/issue', payload);
      return response;
    } catch (err: unknown) {
      // Wrap JIRA error with context
      const message = `Failed to create issue: ${err instanceof Error ? err.message : String(err)}`;
      const error = new Error(message, { cause: err });
      throw error;
    }
  }

  /**
   * Create multiple JIRA issues in bulk (internal method)
   * 
   * **E4-S04: Bulk Implementation**
   * Uses E4-S01 (InputParser), E4-S02 (ManifestStorage), E4-S03 (JiraBulkApiWrapper)
   * 
   * @param input - Array of objects or ParseInputOptions
   * @param options - Optional settings (validate, retry)
   * @returns BulkResult with manifest, totals, and individual results
   * 
   * @throws {Error} If bulk operation dependencies not initialized (cache required)
   * @throws {Error} If parsing or creation fails
   * 
   * @private
   */
  private async createBulk(
    input: IssuesCreateInput,
    _options?: IssuesCreateOptions
  ): Promise<BulkResult> {
    // Ensure bulk dependencies are available
    if (!this.manifestStorage || !this.bulkApiWrapper) {
      throw new Error('Bulk operations require cache to be configured');
    }

    // Parse input to array of records
    let records: Array<Record<string, unknown>>;
    
    if (Array.isArray(input)) {
      // Already an array
      records = input;
    } else {
      // Parse from file or string data (E4-S01)
      const parseResult = await parseInput(input as ParseInputOptions);
      records = parseResult.data;
    }

    // E4-S13 AC3: Detect hierarchy and route accordingly
    const preprocessResult = await preprocessHierarchyRecords(records);
    
    if (preprocessResult.hasHierarchy && preprocessResult.levels.length > 1) {
      // Route to hierarchy-based creation
      return this.createBulkHierarchy(
        preprocessResult.levels,
        preprocessResult.uidMap
      );
    }
    
    // No hierarchy or single level - use existing bulk creation logic
    // If preprocessed, use records from level 0 (uid field already stripped)
    const recordsToProcess = preprocessResult.hasHierarchy && preprocessResult.levels[0]
      ? preprocessResult.levels[0].issues.map(i => i.record)
      : records;

    // Build JIRA payloads for each record (use dry-run mode to get payloads without API calls)
    // Handle validation errors gracefully - collect both successes and failures
    const payloadResults = await Promise.allSettled(
      recordsToProcess.map(async (record, index) => {
        try {
          const issue = await this.createSingle(record, { validate: true });
          return { 
            index, 
            success: true as const, 
            payload: { fields: issue.fields as Record<string, unknown> } 
          };
        } catch (error) {
          // Capture validation errors (e.g., invalid issue type, missing required fields)
          return {
            index,
            success: false as const,
            error: error as Error
          };
        }
      })
    );

    // Separate successful payloads from validation failures
    const validPayloads: Array<{ index: number; payload: { fields: Record<string, unknown> } }> = [];
    const validationErrors: Array<{ index: number; error: Error }> = [];

    payloadResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const value = result.value;
        if (value.success) {
          validPayloads.push({ index: value.index, payload: value.payload });
        } else {
          validationErrors.push({ index: value.index, error: value.error });
        }
      } else {
        // Promise.allSettled rejection (shouldn't happen with try/catch, but handle it)
        validationErrors.push({ 
          index, 
          error: new Error(`Unexpected validation failure: ${result.reason}`) 
        });
      }
    });

    // If ALL records failed validation, throw error
    if (validPayloads.length === 0) {
      const firstError = validationErrors[0]?.error;
      // istanbul ignore next - defensive: firstError is always defined when all records fail
      throw firstError || new Error('All records failed validation');
    }

    // Call bulk API with valid payloads only (E4-S03)
    // istanbul ignore next - defensive: validPayloads.length already checked above
    const apiResult = validPayloads.length > 0 
      ? await this.bulkApiWrapper.createBulk(validPayloads.map(vp => vp.payload))
      : { created: [], failed: [] };

    // Remap API results back to original indices
    const indexMapping = new Map(validPayloads.map((vp, apiIndex) => [apiIndex, vp.index]));
    
    // istanbul ignore next - defensive: mapping always exists for valid indices
    const remappedCreated = apiResult.created.map(item => ({
      ...item,
      index: indexMapping.get(item.index) ?? item.index
    }));
    
    // istanbul ignore next - defensive: mapping always exists for valid indices
    const remappedFailed = apiResult.failed.map(item => ({
      ...item,
      index: indexMapping.get(item.index) ?? item.index
    }));

    // Build manifest (E4-S02)
    const manifestId = `bulk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const createdMap: Record<number, string> = {};
    const errorsMap: Record<number, { status: number; errors: Record<string, string> }> = {};
    
    // Add successfully created issues (remapped to original indices)
    remappedCreated.forEach(item => {
      createdMap[item.index] = item.key;
    });
    
    // Add API-level failures (remapped to original indices)
    remappedFailed.forEach(item => {
      errorsMap[item.index] = { status: item.status, errors: item.errors };
    });

    // Add validation failures (happened before API call)
    validationErrors.forEach(({ index, error }) => {
      errorsMap[index] = { 
        status: 400, 
        errors: { validation: error.message } 
      };
    });

    const manifest: BulkManifest = {
      id: manifestId,
      timestamp: Date.now(),
      total: recordsToProcess.length,
      succeeded: remappedCreated.map(item => item.index),
      failed: [...remappedFailed.map(item => item.index), ...validationErrors.map(ve => ve.index)],
      created: createdMap,
      errors: errorsMap,
    };

    // Store manifest (E4-S02)
    await this.manifestStorage.storeManifest(manifest);

    // Return unified result
    return {
      manifest,
      total: recordsToProcess.length,
      succeeded: remappedCreated.length,
      failed: remappedFailed.length + validationErrors.length,
      results: [
        // Successfully created issues (with remapped indices)
        ...remappedCreated.map(item => ({
          index: item.index,
          success: true as const,
          key: item.key,
        })),
        // API-level failures (with remapped indices)
        ...remappedFailed.map(item => ({
          index: item.index,
          success: false as const,
          error: { status: item.status, errors: item.errors },
        })),
        // Validation failures (before API call)
        ...validationErrors.map(({ index, error }) => ({
          index,
          success: false as const,
          error: { status: 400, errors: { validation: error.message } },
        })),
      ],
    };
  }

  /**
   * Retry hierarchy operation with UID mappings
   * 
   * Story: E4-S13 - AC8: Retry Hierarchy Awareness
   * 
   * When retrying a failed hierarchy operation:
   * 1. Load existing UID→Key mappings from manifest
   * 2. Preprocess failed records to rebuild hierarchy levels
   * 3. Replace UIDs with keys from previous successful creations
   * 4. Create remaining issues level by level
   * 
   * @param filteredInput - Failed records to retry
   * @param failedRowIndices - Original indices of failed records
   * @param manifest - Original manifest with uidMap
   * @returns Combined BulkResult
   * 
   * @private
   */
  private async retryWithHierarchy(
    filteredInput: Array<Record<string, unknown>>,
    failedRowIndices: number[],
    manifest: BulkManifest
  ): Promise<BulkResult> {
    // Preprocess failed records to rebuild hierarchy
    const preprocessResult = await preprocessHierarchyRecords(filteredInput);
    
    // If no hierarchy in retry set, fall back to flat bulk
    if (!preprocessResult.hasHierarchy || preprocessResult.levels.length <= 1) {
      // Use flat bulk retry by calling createBulkHierarchy with single level
      // and existing mappings for UID resolution
      const uidReplacer = new UidReplacer();
      uidReplacer.loadExistingMappings(manifest.uidMap || {});
      
      // Replace UIDs in records before processing
      const recordsWithReplacedUids = filteredInput.map(record => {
        return uidReplacer.replaceUids({ ...record });
      });

      // Build payloads and call bulk API
      const payloadResults = await Promise.allSettled(
        recordsWithReplacedUids.map(async (record, filteredIndex) => {
          try {
            const issue = await this.createSingle(record, { validate: true });
            const originalRecord = filteredInput[filteredIndex];
            return {
              index: filteredIndex,
              success: true as const,
              payload: { fields: issue.fields as Record<string, unknown> },
              uid: originalRecord ? (originalRecord.uid as string) || undefined : undefined,
            };
          } catch (error) {
            return {
              index: filteredIndex,
              success: false as const,
              error: error as Error,
            };
          }
        })
      );

      // Process results
      const validPayloads: Array<{ index: number; payload: { fields: Record<string, unknown> }; uid?: string }> = [];
      const validationErrors: Array<{ index: number; error: Error }> = [];

      payloadResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const value = result.value;
          if (value.success) {
            validPayloads.push({ index: value.index, payload: value.payload, uid: value.uid });
          } else {
            validationErrors.push({ index: value.index, error: value.error });
          }
        } else {
          validationErrors.push({
            index: 0,
            error: new Error(`Unexpected validation failure: ${result.reason}`)
          });
        }
      });

      // Call bulk API
      const apiResult = validPayloads.length > 0
        ? await this.bulkApiWrapper!.createBulk(validPayloads.map(vp => vp.payload))
        : { created: [], failed: [] };

      // Remap results back to original indices and update manifest
      return this.mergeRetryResultsIntoManifest(
        apiResult,
        validPayloads,
        validationErrors,
        failedRowIndices,
        manifest,
        uidReplacer
      );
    }

    // Multi-level hierarchy retry: call createBulkHierarchy with existing mappings
    const hierarchyResult = await this.createBulkHierarchy(
      preprocessResult.levels,
      preprocessResult.uidMap,
      manifest.uidMap // Pass existing UID→Key mappings
    );

    // Merge hierarchy results into original manifest
    // Map filtered indices back to original indices
    const updatedManifest: BulkManifest = {
      id: manifest.id,
      timestamp: manifest.timestamp,
      total: manifest.total,
      succeeded: [...manifest.succeeded],
      failed: [...manifest.failed],
      created: { ...manifest.created },
      errors: { ...manifest.errors },
      uidMap: { ...manifest.uidMap, ...hierarchyResult.manifest.uidMap }, // Merge UID maps
    };

    // Update with retry results
    hierarchyResult.results.forEach(result => {
      // Map back to original index
      const filteredIndex = result.index;
      const originalIndex = failedRowIndices[filteredIndex];
      
      if (originalIndex === undefined) return;

      if (result.success) {
        // Add to succeeded
        if (!updatedManifest.succeeded.includes(originalIndex)) {
          updatedManifest.succeeded.push(originalIndex);
        }
        // Remove from failed
        updatedManifest.failed = updatedManifest.failed.filter(idx => idx !== originalIndex);
        // Add key
        updatedManifest.created[originalIndex] = result.key!;
        // Remove error
        delete updatedManifest.errors[originalIndex];
      } else {
        // Update error
        updatedManifest.errors[originalIndex] = result.error!;
      }
    });

    // Store updated manifest
    await this.manifestStorage!.storeManifest(updatedManifest);

    // Build complete results array
    const results = [];
    for (let i = 0; i < manifest.total; i++) {
      if (updatedManifest.succeeded.includes(i)) {
        results.push({
          index: i,
          success: true as const,
          key: updatedManifest.created[i]
        });
      } else if (updatedManifest.failed.includes(i)) {
        const error = updatedManifest.errors[i];
        if (error) {
          results.push({
            index: i,
            success: false as const,
            error: { status: error.status, errors: error.errors }
          });
        }
      }
    }

    return {
      total: updatedManifest.total,
      succeeded: updatedManifest.succeeded.length,
      failed: updatedManifest.failed.length,
      manifest: updatedManifest,
      results
    };
  }

  /**
   * Merge retry results into original manifest
   * 
   * @private
   */
  private async mergeRetryResultsIntoManifest(
    apiResult: { created: Array<{ index: number; key: string }>; failed: Array<{ index: number; status: number; errors: Record<string, string> }> },
    validPayloads: Array<{ index: number; payload: { fields: Record<string, unknown> }; uid?: string }>,
    validationErrors: Array<{ index: number; error: Error }>,
    failedRowIndices: number[],
    manifest: BulkManifest,
    uidReplacer: UidReplacer
  ): Promise<BulkResult> {
    const updatedManifest: BulkManifest = {
      id: manifest.id,
      timestamp: manifest.timestamp,
      total: manifest.total,
      succeeded: [...manifest.succeeded],
      failed: [...manifest.failed],
      created: { ...manifest.created },
      errors: { ...manifest.errors },
      uidMap: { ...manifest.uidMap },
    };

    // Process API successes
    apiResult.created.forEach(item => {
      const validPayload = validPayloads[item.index];
      if (!validPayload) return;
      
      const filteredIndex = validPayload.index;
      const originalIndex = failedRowIndices[filteredIndex];
      if (originalIndex === undefined) return;

      // Update succeeded/failed arrays
      if (!updatedManifest.succeeded.includes(originalIndex)) {
        updatedManifest.succeeded.push(originalIndex);
      }
      updatedManifest.failed = updatedManifest.failed.filter(idx => idx !== originalIndex);
      
      // Add key
      updatedManifest.created[originalIndex] = item.key;
      delete updatedManifest.errors[originalIndex];

      // Record UID mapping if present
      if (validPayload.uid) {
        uidReplacer.recordCreation(validPayload.uid, item.key);
      }
    });

    // Process API failures
    apiResult.failed.forEach(item => {
      const validPayload = validPayloads[item.index];
      if (!validPayload) return;
      
      const filteredIndex = validPayload.index;
      const originalIndex = failedRowIndices[filteredIndex];
      if (originalIndex === undefined) return;

      updatedManifest.errors[originalIndex] = { status: item.status, errors: item.errors };
    });

    // Process validation errors
    validationErrors.forEach(({ index: filteredIndex, error }) => {
      const originalIndex = failedRowIndices[filteredIndex];
      if (originalIndex === undefined) return;

      updatedManifest.errors[originalIndex] = { status: 400, errors: { validation: error.message } };
    });

    // Update uidMap with new mappings
    updatedManifest.uidMap = {
      ...updatedManifest.uidMap,
      ...uidReplacer.getUidMap()
    };

    // Store updated manifest
    await this.manifestStorage!.storeManifest(updatedManifest);

    // Build results array
    const results = [];
    for (let i = 0; i < manifest.total; i++) {
      if (updatedManifest.succeeded.includes(i)) {
        results.push({
          index: i,
          success: true as const,
          key: updatedManifest.created[i]
        });
      } else if (updatedManifest.failed.includes(i)) {
        const error = updatedManifest.errors[i];
        if (error) {
          results.push({
            index: i,
            success: false as const,
            error: { status: error.status, errors: error.errors }
          });
        }
      }
    }

    return {
      total: updatedManifest.total,
      succeeded: updatedManifest.succeeded.length,
      failed: updatedManifest.failed.length,
      manifest: updatedManifest,
      results
    };
  }

  /**
   * Create issues with hierarchy using level-based batching
   * 
   * Story: E4-S13 - AC2: Level-Based Handler Method
   * 
   * Processes hierarchy levels sequentially:
   * 1. Create Level 0 issues (roots/epics)
   * 2. Replace Parent UIDs with actual keys
   * 3. Create Level 1 issues (children of roots)
   * 4. Continue for all levels...
   * 
   * This enables efficient parallel creation within each level
   * while maintaining parent-before-child dependencies.
   * 
   * @param levels - Hierarchy levels from preprocessHierarchyRecords()
   * @param uidMap - Initial UID to index mapping (for tracking)
   * @param existingMappings - Existing UID→Key mappings (for retry)
   * @returns BulkResult with all created issues and UID mappings
   * 
   * @private
   */
  async createBulkHierarchy(
    levels: HierarchyLevel[],
    _uidMap?: Record<string, number>, // Preserved for future retry index mapping
    existingMappings?: Record<string, string>
  ): Promise<BulkResult> {
    // Ensure bulk dependencies are available
    if (!this.manifestStorage || !this.bulkApiWrapper) {
      throw new Error('Bulk operations require cache to be configured');
    }

    const uidReplacer = new UidReplacer();
    
    // Load existing mappings for retry scenarios
    if (existingMappings) {
      uidReplacer.loadExistingMappings(existingMappings);
    }

    // Track all results across levels
    const allCreated: Array<{ index: number; key: string }> = [];
    const allFailed: Array<{ index: number; status: number; errors: Record<string, string> }> = [];
    const allValidationErrors: Array<{ index: number; error: Error }> = [];
    let totalIssues = 0;

    // Process each level sequentially
    for (const level of levels) {
      totalIssues += level.issues.length;

      // Build payloads for this level (with UID replacement)
      const payloadResults = await Promise.allSettled(
        level.issues.map(async (issue) => {
          try {
            // Replace UIDs with actual keys from previous levels
            const recordWithReplacedUids = uidReplacer.replaceUids({ ...issue.record });
            
            // Build JIRA payload using validate mode
            const payload = await this.createSingle(recordWithReplacedUids, { validate: true });
            return {
              index: issue.index,
              success: true as const,
              payload: { fields: payload.fields as Record<string, unknown> },
              uid: (issue.record.uid as string) || undefined,
            };
          } catch (error) {
            return {
              index: issue.index,
              success: false as const,
              error: error as Error,
            };
          }
        })
      );

      // Separate successful payloads from validation failures
      const validPayloads: Array<{ 
        index: number; 
        payload: { fields: Record<string, unknown> }; 
        uid?: string;
      }> = [];
      
      payloadResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const value = result.value;
          if (value.success) {
            validPayloads.push({ 
              index: value.index, 
              payload: value.payload,
              uid: value.uid,
            });
          } else {
            allValidationErrors.push({ index: value.index, error: value.error });
          }
        } else {
          // Promise rejection (shouldn't happen with try/catch)
          allValidationErrors.push({ 
            index: level.issues[0]?.index ?? 0, 
            error: new Error(`Unexpected validation failure: ${result.reason}`) 
          });
        }
      });

      // Skip API call if no valid payloads for this level
      if (validPayloads.length === 0) {
        continue;
      }

      // Call bulk API for this level
      const apiResult = await this.bulkApiWrapper.createBulk(
        validPayloads.map(vp => vp.payload)
      );

      // Process results and record UID→Key mappings
      apiResult.created.forEach((item) => {
        const validPayload = validPayloads[item.index];
        if (validPayload) {
          // Remap to original index
          allCreated.push({ 
            index: validPayload.index, 
            key: item.key 
          });
          
          // Record UID→Key mapping for next level
          if (validPayload.uid) {
            uidReplacer.recordCreation(validPayload.uid, item.key);
          }
        }
      });

      // Collect failures (remap indices)
      apiResult.failed.forEach((item) => {
        const validPayload = validPayloads[item.index];
        if (validPayload) {
          allFailed.push({
            index: validPayload.index,
            status: item.status,
            errors: item.errors,
          });
        }
      });
    }

    // Build manifest with UID mappings
    const manifestId = `bulk-hier-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const createdMap: Record<number, string> = {};
    const errorsMap: Record<number, { status: number; errors: Record<string, string> }> = {};

    allCreated.forEach(item => {
      createdMap[item.index] = item.key;
    });

    allFailed.forEach(item => {
      errorsMap[item.index] = { status: item.status, errors: item.errors };
    });

    allValidationErrors.forEach(({ index, error }) => {
      errorsMap[index] = { status: 400, errors: { validation: error.message } };
    });

    const manifest: BulkManifest = {
      id: manifestId,
      timestamp: Date.now(),
      total: totalIssues,
      succeeded: allCreated.map(item => item.index),
      failed: [...allFailed.map(item => item.index), ...allValidationErrors.map(ve => ve.index)],
      created: createdMap,
      errors: errorsMap,
      uidMap: uidReplacer.getUidMap(), // Include UID mappings for retry
    };

    // Store manifest
    await this.manifestStorage.storeManifest(manifest);

    return {
      manifest,
      total: totalIssues,
      succeeded: allCreated.length,
      failed: allFailed.length + allValidationErrors.length,
      results: [
        ...allCreated.map(item => ({
          index: item.index,
          success: true as const,
          key: item.key,
        })),
        ...allFailed.map(item => ({
          index: item.index,
          success: false as const,
          error: { status: item.status, errors: item.errors },
        })),
        ...allValidationErrors.map(({ index, error }) => ({
          index,
          success: false as const,
          error: { status: 400, errors: { validation: error.message } },
        })),
      ],
    };
  }
}

