import { JiraClient } from '../client/JiraClient.js';
import { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import { FieldResolver } from '../converters/FieldResolver.js';
import { ConverterRegistry } from '../converters/ConverterRegistry.js';
import { Issue, CreateIssueOptions } from '../types/index.js';
import { BulkResult, BulkManifest } from '../types/bulk.js';
import { LookupCache, GenericCache } from '../types/converter.js';
import type { JMLConfig } from '../types/config.js';
import { convertProjectType } from '../converters/types/ProjectConverter.js';
import { parseInput, ParseInputOptions } from '../parsers/InputParser.js';
import { ManifestStorage } from './ManifestStorage.js';
import { JiraBulkApiWrapper } from './JiraBulkApiWrapper.js';
import { RedisCache } from '../cache/RedisCache.js';
import { UidReplacer } from './bulk/UidReplacer.js';
import type { HierarchyLevel } from './bulk/HierarchyLevels.js';
import { preprocessHierarchyRecords } from './bulk/HierarchyPreprocessor.js';

/**
 * Input type for unified create() method
 */
type CreateInput = 
  | Record<string, unknown>  // Single issue object
  | Array<Record<string, unknown>>  // Array of issue objects
  | ParseInputOptions;  // File path or string data with format

/**
 * Options for create() method
 */
interface CreateOptions {
  /** Validate only (dry-run mode) - don't create issues */
  validate?: boolean;
  /** Retry with manifest ID (skip already-created issues) */
  retry?: string;
}

/**
 * Issue operations for creating, updating, and managing JIRA issues
 * 
 * E4-S04: Unified create() method supports both single and bulk creation
 */
export class IssueOperations {
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
      this.bulkApiWrapper = new JiraBulkApiWrapper(client);
    }
  }

  /**
   * Create JIRA issues - handles single or bulk creation
   * 
   * **E4-S04: Unified API**
   * This method detects input type automatically:
   * - Single object with Project field → creates one issue (E1-S09)
   * - Array of objects → bulk creation (E4-S01, E4-S02, E4-S03)
   * - ParseInputOptions (from/data/format) → parse then bulk create
   * 
   * @param input - Issue data (single, array, or parse options)
   * @param options - Optional settings (validate, retry)
   * @returns Single Issue or BulkResult
   * 
   * @throws {Error} If input type cannot be determined
   * @throws {Error} If validation or creation fails
   * 
   * @example Single issue
   * ```typescript
   * const issue = await issueOps.create({
   *   Project: 'ENG',
   *   'Issue Type': 'Bug',
   *   Summary: 'Login fails'
   * });
   * ```
   * 
   * @example Bulk from array
   * ```typescript
   * const result = await issueOps.create([
   *   { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Issue 1' },
   *   { Project: 'ENG', 'Issue Type': 'Task', Summary: 'Issue 2' }
   * ]);
   * console.log(`Created ${result.succeeded} of ${result.total} issues`);
   * ```
   * 
   * @example Bulk from CSV
   * ```typescript
   * const result = await issueOps.create({ from: './issues.csv' });
   * ```
   */
  async create(
    input: CreateInput,
    options?: CreateOptions
  ): Promise<Issue | BulkResult> {
    // E4-S05: Handle retry with manifest ID
    if (options?.retry) {
      return this.retryWithManifest(input, options.retry, options);
    }

    const inputType = this.detectInputType(input);

    if (inputType === 'single') {
      // Dispatch to single-issue creation (E1-S09)
      return this.createSingle(input as Record<string, unknown>, options);
    }

    // Dispatch to bulk creation (E4-S01, E4-S02, E4-S03)
    return this.createBulk(input, options);
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
    input: CreateInput,
    manifestId: string,
    _options?: CreateOptions
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
   * @param input - Input data
   * @returns 'single' for single issue object, 'bulk' for arrays or parse options
   */
  private detectInputType(input: CreateInput): 'single' | 'bulk' {
    // Array of objects → bulk
    if (Array.isArray(input)) {
      return 'bulk';
    }

    // Parse options (from/data/format) → bulk
    const parseOpts = input as ParseInputOptions;
    if (parseOpts.from || parseOpts.data !== undefined || parseOpts.format) {
      return 'bulk';
    }

    // Single object with Project field → single
    const obj = input as Record<string, unknown>;
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
   * @param options - Optional settings (validate for dry-run mode)
   * @returns Created issue with key, id, and self URL
   * 
   * @throws {Error} If Project or Issue Type is missing
   * @throws {Error} If JIRA API returns an error
   * 
   * @private
   */
  private async createSingle(
    input: Record<string, unknown>,
    options?: CreateIssueOptions
  ): Promise<Issue> {
    // Extract required fields (case-insensitive)
    const projectInput = input['Project'] || input['project'];
    const issueType = input['Issue Type'] || input['issuetype'] || input['issueType'];

    // Validate required fields
    if (!projectInput || typeof projectInput !== 'string') {
      throw new Error("Field 'Project' is required and must be a string");
    }
    if (!issueType || typeof issueType !== 'string') {
      throw new Error("Field 'Issue Type' is required and must be a string");
    }

    // CRITICAL: Resolve project value to key BEFORE using in API calls
    // The project input could be a key ("ENG") or name ("Engineering Project")
    // But createmeta API requires the key, so we must resolve it first
    // Use a minimal fieldSchema and context since we only need project resolution
    const projectResolved = await convertProjectType(
      projectInput,
      { 
        id: 'project', 
        name: 'Project', 
        type: 'project', 
        required: true, 
        schema: { type: 'project' } 
      },
      {
        baseUrl: this.baseUrl,
        cache: this.cache,
        client: this.client,
        projectKey: '', // Will be resolved from projectInput
        issueType: String(issueType), // Already validated above
      }
    ) as { key: string };
    const projectKey = projectResolved.key;

    // Update input with resolved project value so converter receives the correct format
    // This ensures the final payload has { project: { key: "PROJ" } } not { project: "Zulu" }
    const inputWithResolvedProject = {
      ...input,
      'Project': projectResolved, // Replace with resolved { key: "..." }
      'project': projectResolved, // Also set lowercase version for consistency
    };

    // Resolve field names → IDs
    const resolvedFields = await this.resolver.resolveFields(
      projectKey,
      issueType,
      inputWithResolvedProject
    );

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
        config: this.config // Pass config for converter customization (AC8, AC9)
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
    input: CreateInput,
    _options?: CreateOptions
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
      throw firstError || new Error('All records failed validation');
    }

    // Call bulk API with valid payloads only (E4-S03)
    const apiResult = validPayloads.length > 0 
      ? await this.bulkApiWrapper.createBulk(validPayloads.map(vp => vp.payload))
      : { created: [], failed: [] };

    // Remap API results back to original indices
    const indexMapping = new Map(validPayloads.map((vp, apiIndex) => [apiIndex, vp.index]));
    
    const remappedCreated = apiResult.created.map(item => ({
      ...item,
      index: indexMapping.get(item.index) ?? item.index
    }));
    
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

