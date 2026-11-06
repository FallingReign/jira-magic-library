import { JiraClient } from '../client/JiraClient.js';
import { SchemaDiscovery } from '../schema/SchemaDiscovery.js';
import { FieldResolver } from '../converters/FieldResolver.js';
import { ConverterRegistry } from '../converters/ConverterRegistry.js';
import { Issue } from '../types/index.js';
import type { AttachmentInput, AttachmentUploadResult } from '../types/attachment.js';
import { BulkResult, BulkManifest, BulkValidationResult } from '../types/bulk.js';
import { LookupCache, GenericCache } from '../types/converter.js';
import type { JMLConfig, DeploymentType, AmbiguityPolicyConfig, FuzzyMatchConfig } from '../types/config.js';
import { parseInput, ParseInputOptions } from '../parsers/InputParser.js';
import { ManifestStorage } from './ManifestStorage.js';
import { JiraBulkApiWrapper } from './JiraBulkApiWrapper.js';
import { RedisCache } from '../cache/RedisCache.js';
import { UidReplacer } from './bulk/UidReplacer.js';
import type { HierarchyLevel } from './bulk/HierarchyLevels.js';
import { preprocessHierarchyRecords } from './bulk/HierarchyPreprocessor.js';
import { IssueSearch } from './IssueSearch.js';
import type { ProgressUpdate } from '../types/bulk.js';
import { createBulkInGroups, type GroupedBulkResult } from './bulk/GroupedBulkSender.js';
import { BulkProgressReporter } from './bulk/BulkProgressReporter.js';
import {
  cloneManifest, compactManifest, manifestResults, markCreated, markFailed,
  markNotConfirmed, markNotSent, retryableRows, toSendError, unsuccessfulCount,
} from './bulk/ManifestRows.js';
import { resolveBulkGroupSize } from '../config/bulkGroupSize.js';
import { CloudCreateAdapter } from './CloudCreateAdapter.js';
import { EndpointResolver } from '../client/EndpointResolver.js';
import { PayloadPreview } from './PayloadPreview.js';
import type { PreviewResult } from './PayloadPreview.js';
import { AttachmentUploader } from './AttachmentUploader.js';
import { AttachmentUploadError } from '../errors/AttachmentUploadError.js';
import { ValidationError } from '../errors/ValidationError.js';
import { normalizeFieldName } from '../utils/normalizeFieldName.js';
import { prepareIssueFields } from './prepareIssueFields.js';

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
  /**
   * Progress callback for bulk create.
   * Called after each group of `bulk.groupSize` issues returns from Jira,
   * with counts taken from Jira's replies (across all hierarchy levels).
   * Does not change any HTTP timeout.
   * @example
   * ```typescript
   * await jml.issues.create(rows, {
   *   onProgress: (progress) => {
   *     console.log(`${progress.completed}/${progress.total} rows answered`);
   *   }
   * });
   * ```
   */
  onProgress?: (progress: ProgressUpdate) => void;
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
  ): Promise<Issue | BulkResult | BulkValidationResult>;

  /**
   * Search for issues using human-readable field names and values.
   *
   * - Leverages existing field resolution and value conversion logic.
   * - Generates optimized JQL queries automatically.
   * - Supports fuzzy matching, custom fields, and complex criteria.
   *
   * @param criteria - Search criteria with human-readable field names.
   * @returns Array of matching issues.
   * @example
   * ```typescript
   * const issues = await jml.issues.search({
   *   project: "Engineering",
   *   assignee: "John Smith",
   *   status: "In Progress",
   *   "Risk Level": "High",
   *   labels: ["backend", "urgent"],
   *   createdSince: "2025-02-12"
   * });
   * ```
   */
  search(criteria: Record<string, unknown>): Promise<Issue[]>;

  /**
   * Preview resolved payload without submitting to Jira.
   *
   * Runs the same resolution + conversion + adaptation flow as `create()`,
   * but returns the final payload with metadata about each field resolution
   * instead of posting it.
   *
   * @param input - Single object or array of objects to preview
   * @returns PreviewResult for single, PreviewResult[] for array
   */
  preview(input: IssuesCreateInput): Promise<PreviewResult | PreviewResult[]>;

  /**
   * Attach files to an existing issue.
   *
   * Delegates to the existing multipart upload pipeline — no new HTTP wiring
   * is introduced. Each attachment becomes a separate entry in the returned
   * array, preserving the order in which Jira reports them.
   *
   * @param issueKey - The issue key to attach files to (e.g. `"ENG-123"`).
   * @param attachments - Local file paths or in-memory byte payloads.
   * @returns Jira's attachment metadata for every uploaded file. Common fields
   *   include `id`, `filename`, and `size` (size may be absent on some Jira
   *   deployments); the full Jira response is passed through.
   *
   * @throws {ValidationError} When `issueKey` is blank or whitespace.
   * @throws {AttachmentUploadError} When the upload fails (status is carried
   *   on the error; 403 names likely causes, 413 names the size-limit cause).
   *
   * @example
   * ```typescript
   * const records = await jml.issues.addAttachments('ENG-123', [
   *   './screenshots/before.png',
   * ]);
   * // id, filename and size (when present) are among the available fields:
   * console.log(records[0].id, records[0].filename, records[0].size);
   * ```
   */
  addAttachments(issueKey: string, attachments: AttachmentInput[]): Promise<AttachmentUploadResult[]>;
}

/**
 * Issue operations for creating, updating, and managing JIRA issues
 *
 * E4-S04: Unified create() method supports both single and bulk creation
 */
export class IssueOperations implements IssuesAPI {
  private manifestStorage?: ManifestStorage;
  private bulkApiWrapper?: JiraBulkApiWrapper;
  private issueSearch: IssueSearch;
  private cloudAdapter?: CloudCreateAdapter;
  private endpointResolverFn?: () => Promise<EndpointResolver>;
  private readonly attachmentUploader: AttachmentUploader;
  private readonly bulkGroupSize: number;

  constructor(
    private client: JiraClient,
    private schema: SchemaDiscovery,
    private resolver: FieldResolver,
    private converter: ConverterRegistry,
    private cache?: LookupCache,
    private baseUrl?: string,
    private config?: JMLConfig,
    private deployment?: DeploymentType,
    endpointResolverFn?: () => Promise<EndpointResolver>
  ) {
    this.endpointResolverFn = endpointResolverFn;
    this.attachmentUploader = new AttachmentUploader(client);
    this.bulkGroupSize = resolveBulkGroupSize(config);
    // Initialize bulk operation dependencies if cache available
    // Note: LookupCache is always RedisCache at runtime (from JML constructor)
    if (cache) {
      this.manifestStorage = new ManifestStorage(cache as unknown as RedisCache);

      // Pass bulk timeout from config to wrapper (default 30s if not configured)
      const bulkTimeout = this.config?.timeout?.bulk;
      this.bulkApiWrapper = new JiraBulkApiWrapper(client, bulkTimeout);
    }

    // Initialize Issue Search API (Phase 2.1)
    this.issueSearch = new IssueSearch(client, schema, resolver, converter);
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
  ): Promise<Issue | BulkResult | BulkValidationResult> {
    // Validation must branch before retries, bulk storage, markers, and all submission paths.
    if (options?.validate) {
      const normalized = this.normalizeInput(input);
      if (!options.retry && this.detectInputType(normalized) === 'single') {
        return this.createSingle(normalized as Record<string, unknown>, options);
      }
      return this.validateBulkInput(normalized, options);
    }

    // E4-S05: Handle retry with manifest ID
    if (options?.retry) {
      return this.retryWithManifest(this.normalizeInput(input), options.retry, options);
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

  private async validateBulkInput(
    input: IssuesCreateInput,
    options: IssuesCreateOptions
  ): Promise<BulkValidationResult> {
    const records = Array.isArray(input) ? input : (await this.parseIssueInput(input as ParseInputOptions)).data;
    const normalized = records.map(record => this.normalizeInput(record) as Record<string, unknown>);
    await preprocessHierarchyRecords(normalized);
    this.rejectBulkAttachments(normalized);
    let indices = normalized.map((_record, index) => index);
    let existingParents: Record<string, string> = {};
    if (options.retry) {
      const manifest = await this.manifestStorage?.getManifest(options.retry);
      if (!manifest) throw new ValidationError(`Manifest '${options.retry}' not found or expired`);
      indices = retryableRows(manifest);
      existingParents = manifest.uidMap ?? {};
    }

    const uidIndices = new Map(normalized.flatMap((record, index) =>
      typeof record.uid === 'string' ? [[record.uid, index] as const] : []));
    const results: BulkValidationResult['results'] = [];
    for (const index of indices) {
      const dependencies: BulkValidationResult['results'][number]['dependencies'] = [];
      try {
        if (!normalized[index]) throw new ValidationError(`Retry row ${index} is missing from the input`);
        const record = { ...normalized[index] };
        for (const [field, value] of Object.entries(record)) {
          if (normalizeFieldName(field) !== 'parent' || typeof value !== 'string') continue;
          if (existingParents[value]) {
            record[field] = existingParents[value];
          } else if (uidIndices.has(value)) {
            dependencies.push({ field, uid: value, index: uidIndices.get(value)! });
            delete record[field];
          }
        }
        const prepared = await this.createSingle(record, { ...options, validate: true });
        results.push({ index, valid: true, payload: { fields: prepared.fields! }, dependencies });
      } catch (error) {
        results.push({ index, valid: false, error: error instanceof Error ? error.message : String(error), dependencies });
      }
    }
    return { validation: true, valid: results.every(result => result.valid), total: results.length, results };
  }

  private parseIssueInput(input: ParseInputOptions): ReturnType<typeof parseInput> {
    return parseInput({ preprocessQuotes: this.config?.preprocessQuotes, ...input });
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

    const failedRowIndices = retryableRows(manifest);

    // If nothing is left to resend, return current state immediately
    if (failedRowIndices.length === 0) {
      return {
        total: manifest.total,
        succeeded: manifest.succeeded.length,
        failed: manifest.notConfirmed?.length ?? 0,
        manifest,
        results: manifestResults(manifest),
      };
    }

    // AC2: Parse input and filter to only failed rows
    let inputArray: Array<Record<string, unknown>>;
    if (Array.isArray(input)) {
      inputArray = input;
    } else if (typeof input === 'object' && ('from' in input || 'data' in input)) {
      // Parse from file/string
      const parseResult = await this.parseIssueInput(input as ParseInputOptions);
      inputArray = parseResult.data;
    } else {
      throw new Error('Retry requires array or parse options input format');
    }

    inputArray = inputArray.map(record => this.normalizeInput(record) as Record<string, unknown>);
    this.rejectBulkAttachments(inputArray);

    const allUidIndices: Record<string, number> = {};
    inputArray.forEach((record, index) => {
      const uid = record.uid;
      if (typeof uid === 'string' || typeof uid === 'number') {
        const normalizedUid = String(uid).trim();
        if (normalizedUid) allUidIndices[normalizedUid] = index;
      }
    });

    // Filter to only include rows that previously failed
    const filteredInput = inputArray.filter((_, index) => {
      return failedRowIndices.includes(index);
    });

    // eslint-disable-next-line no-console
    console.log(`🔄 Retrying ${filteredInput.length} failed rows from manifest ${manifestId}`);

    // Keep hierarchy-aware blocking even when no parent was confirmed during
    // the original attempt and the manifest therefore has no UID→key entries.
    if (
      Object.keys(allUidIndices).length > 0 ||
      Object.keys(manifest.uidMap ?? {}).length > 0
    ) {
      return this.retryWithHierarchy(
        filteredInput,
        failedRowIndices,
        manifest,
        _options, // Pass options for progress tracking
        allUidIndices
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

    const reporter = new BulkProgressReporter(filteredInput.length, _options?.onProgress);
    reporter.record(0, validationErrors.length);
    const apiResult = await this.sendInGroups(validPayloads.map(vp => vp.payload), reporter);
    reporter.flush();

    return this.mergeRetryResultsIntoManifest(
      apiResult,
      validPayloads,
      validationErrors,
      failedRowIndices,
      manifest,
      new UidReplacer()
    );
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
   * @returns Created issue with key, id, self URL, and optional uploaded attachment metadata
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
    const attachmentKey = Object.keys(input).find(
      (key) => normalizeFieldName(key) === 'attachments'
    );
    const attachments = await this.attachmentUploader.validate(
      attachmentKey ? input[attachmentKey] : undefined
    );
    const cleanInput = Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== 'uid' && key !== attachmentKey)
    );
    
    // Merge per-call config overrides with instance config
    const mergedConfig = this.mergeConfig(options);
    
    // S4: Defer project/issueType extraction to FieldResolver
    // This handles all formats: string, object with key/id, object with name
    // Returns projectKey (for schema lookup), issueType (for schema lookup), 
    // and resolved fields (with project/issuetype already in JIRA format)
    const convertedFields = await prepareIssueFields(
      cleanInput, this.schema, this.resolver, this.converter,
      { 
        baseUrl: this.baseUrl, 
        cache: this.cache,
        cacheClient: this.cache as unknown as GenericCache, // RedisCache implements both LookupCache and GenericCache
        client: this.client,
        config: mergedConfig, // Pass merged config for converter customization (AC8, AC9, per-call overrides)
        endpointResolverFn: this.endpointResolverFn,
      }
    );

    // Build JIRA payload
    let payload: Record<string, unknown> = {
      fields: convertedFields,
    };

    // Apply Cloud/Server adaptation before sending
    payload = await this.adaptForDeployment(payload);

    // Dry-run mode: return payload without API call
    if (options?.validate) {
      return {
        key: 'DRY-RUN',
        id: '0',
        self: '',
        fields: payload.fields as Record<string, unknown>,
      };
    }

    // Resolve endpoint (use EndpointResolver if available, else fallback)
    const endpoint = await this.resolveIssueCreateEndpoint();

    // Create issue via JIRA API
    try {
      const response = await this.client.post<Issue>(endpoint, payload);

      if (attachments.length === 0) {
        return response;
      }

      try {
        const attachmentEndpoint = await this.resolveIssueAttachmentsEndpoint(response.key);
        const uploadedAttachments = await this.attachmentUploader.uploadForIssue(
          attachmentEndpoint,
          attachments,
          response.key
        );
        return {
          ...response,
          attachments: uploadedAttachments,
        };
      } catch (err: unknown) {
        if (err instanceof AttachmentUploadError) {
          throw err;
        }
        throw new AttachmentUploadError(
          response.key,
          err instanceof Error ? err.message : String(err),
          err
        );
      }
    } catch (err: unknown) {
      if (err instanceof AttachmentUploadError) {
        throw err;
      }
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
    // Parse input to array of records
    let records: Array<Record<string, unknown>>;
    
    if (Array.isArray(input)) {
      // Already an array
      records = input;
    } else {
      // Parse from file or string data (E4-S01)
      const parseResult = await this.parseIssueInput(input as ParseInputOptions);
      records = parseResult.data;
    }

    records = records.map(record => this.normalizeInput(record) as Record<string, unknown>);
    this.rejectBulkAttachments(records);

    // Ensure bulk dependencies are available
    if (!this.manifestStorage || !this.bulkApiWrapper) {
      throw new Error('Bulk operations require cache to be configured');
    }

    // E4-S13 AC3: Detect hierarchy and route accordingly
    const preprocessResult = await preprocessHierarchyRecords(records);
    
    if (preprocessResult.hasHierarchy && preprocessResult.levels.length > 1) {
      // Route to hierarchy-based creation
      return this.createBulkHierarchy(
        preprocessResult.levels,
        preprocessResult.uidMap,
        undefined, // existingMappings
        _options // options for progress tracking
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

    const reporter = new BulkProgressReporter(recordsToProcess.length, _options?.onProgress);
    reporter.record(0, validationErrors.length);
    const apiResult = await this.sendInGroups(validPayloads.map(vp => vp.payload), reporter);

    // Remap API results back to original indices
    const toRow = (apiIndex: number): number => validPayloads[apiIndex]!.index;
    const remappedCreated = apiResult.created.map(item => ({ ...item, index: toRow(item.index) }));
    const remappedFailed = apiResult.failed.map(item => ({ ...item, index: toRow(item.index) }));
    const remappedNotConfirmed = apiResult.notConfirmed.map(toRow);
    const remappedNotSent = apiResult.notSent.map(toRow);

    // Build manifest (E4-S02)
    const manifestId = `bulk-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const createdMap: Record<number, string> = {};
    const errorsMap: Record<number, { status: number; errors: Record<string, string> }> = {};

    remappedCreated.forEach(item => {
      createdMap[item.index] = item.key;
    });
    remappedFailed.forEach(item => {
      errorsMap[item.index] = { status: item.status, errors: item.errors };
    });
    validationErrors.forEach(({ index, error }) => {
      errorsMap[index] = { status: 400, errors: { validation: error.message } };
    });

    const manifest: BulkManifest = {
      id: manifestId,
      timestamp: Date.now(),
      total: recordsToProcess.length,
      succeeded: remappedCreated.map(item => item.index),
      failed: [...remappedFailed.map(item => item.index), ...validationErrors.map(ve => ve.index)],
      ...(remappedNotConfirmed.length > 0 ? { notConfirmed: remappedNotConfirmed } : {}),
      ...(remappedNotSent.length > 0 ? { notSent: remappedNotSent } : {}),
      created: createdMap,
      errors: errorsMap,
    };

    await this.manifestStorage.storeManifest(manifest);
    const sendError = toSendError(apiResult.sendError);

    return {
      manifest,
      total: recordsToProcess.length,
      succeeded: remappedCreated.length,
      failed: unsuccessfulCount(manifest),
      results: [
        ...remappedCreated.map(item => ({
          index: item.index,
          success: true as const,
          outcome: 'created' as const,
          key: item.key,
        })),
        ...remappedFailed.map(item => ({
          index: item.index,
          success: false as const,
          outcome: 'failed' as const,
          error: { status: item.status, errors: item.errors },
        })),
        ...validationErrors.map(({ index, error }) => ({
          index,
          success: false as const,
          outcome: 'failed' as const,
          error: { status: 400, errors: { validation: error.message } },
        })),
        ...remappedNotConfirmed.map(index => ({
          index,
          success: false as const,
          outcome: 'not_confirmed' as const,
        })),
        ...remappedNotSent.map(index => ({
          index,
          success: false as const,
          outcome: 'not_sent' as const,
        })),
      ],
      ...(apiResult.unmatchedKeys ? { unmatchedKeys: apiResult.unmatchedKeys } : {}),
      ...(sendError ? { sendError } : {}),
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
   * @param options - Options including progress callback
   * @returns Combined BulkResult
   *
   * @private
   */
  private async retryWithHierarchy(
    filteredInput: Array<Record<string, unknown>>,
    failedRowIndices: number[],
    manifest: BulkManifest,
    options?: IssuesCreateOptions,
    allUidIndices?: Record<string, number>
  ): Promise<BulkResult> {
    // Preprocess failed records to rebuild hierarchy
    const preprocessResult = await preprocessHierarchyRecords(filteredInput);
    
    // If no hierarchy in retry set, fall back to flat bulk
    if (!preprocessResult.hasHierarchy) {
      // Use flat bulk retry by calling createBulkHierarchy with single level
      // and existing mappings for UID resolution
      const uidReplacer = new UidReplacer();
      uidReplacer.loadExistingMappings(manifest.uidMap!);
      
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

      const reporter = new BulkProgressReporter(filteredInput.length, options?.onProgress);
      reporter.record(0, validationErrors.length);
      const apiResult = await this.sendInGroups(validPayloads.map(vp => vp.payload), reporter);
      reporter.flush();

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
      { ...allUidIndices, ...preprocessResult.uidMap },
      manifest.uidMap, // Pass existing UID→Key mappings
      options // options for progress tracking
    );

    const updatedManifest = cloneManifest(manifest);
    updatedManifest.uidMap = { ...manifest.uidMap, ...hierarchyResult.manifest.uidMap };

    // Map retry rows back to original row indices
    hierarchyResult.results.forEach(result => {
      const originalIndex = failedRowIndices[result.index];
      if (originalIndex === undefined) return;

      if (result.success) {
        markCreated(updatedManifest, originalIndex, result.key!);
      } else if (result.outcome === 'not_confirmed') {
        markNotConfirmed(updatedManifest, originalIndex);
      } else if (result.outcome === 'not_sent') {
        markNotSent(updatedManifest, originalIndex);
      } else {
        markFailed(updatedManifest, originalIndex, result.error!);
      }
    });

    return this.finishRetry(updatedManifest, hierarchyResult.unmatchedKeys, hierarchyResult.sendError);
  }

  /**
   * Merge retry results into original manifest
   * 
   * @private
   */
  private async mergeRetryResultsIntoManifest(
    apiResult: GroupedBulkResult,
    validPayloads: Array<{ index: number; payload: { fields: Record<string, unknown> }; uid?: string }>,
    validationErrors: Array<{ index: number; error: Error }>,
    failedRowIndices: number[],
    manifest: BulkManifest,
    uidReplacer: UidReplacer
  ): Promise<BulkResult> {
    const updatedManifest = cloneManifest(manifest);
    const toOriginal = (filteredIndex: number | undefined, label: number): number => {
      const row = filteredIndex === undefined ? undefined : failedRowIndices[filteredIndex];
      if (row === undefined) {
        throw new Error(`Failed to map filtered index ${label} to original index`);
      }
      return row;
    };
    const toRow = (apiIndex: number): number => toOriginal(validPayloads[apiIndex]?.index, apiIndex);

    apiResult.created.forEach(item => {
      markCreated(updatedManifest, toRow(item.index), item.key);
      const uid = validPayloads[item.index]!.uid;
      if (uid) uidReplacer.recordCreation(uid, item.key);
    });
    apiResult.failed.forEach(item => {
      markFailed(updatedManifest, toRow(item.index), { status: item.status, errors: item.errors });
    });
    apiResult.notConfirmed.forEach(apiIndex => markNotConfirmed(updatedManifest, toRow(apiIndex)));
    apiResult.notSent.forEach(apiIndex => markNotSent(updatedManifest, toRow(apiIndex)));
    validationErrors.forEach(({ index, error }) => {
      markFailed(updatedManifest, toOriginal(index, index), { status: 400, errors: { validation: error.message } });
    });

    const uidMap = { ...manifest.uidMap, ...uidReplacer.getUidMap() };
    if (manifest.uidMap || Object.keys(uidMap).length > 0) updatedManifest.uidMap = uidMap;

    return this.finishRetry(updatedManifest, apiResult.unmatchedKeys, toSendError(apiResult.sendError));
  }

  /**
   * Store a merged retry manifest and build the full result for every row.
   * @private
   */
  private async finishRetry(
    manifest: BulkManifest,
    unmatchedKeys?: string[],
    sendError?: BulkResult['sendError']
  ): Promise<BulkResult> {
    compactManifest(manifest);
    await this.manifestStorage!.storeManifest(manifest);
    return {
      total: manifest.total,
      succeeded: manifest.succeeded.length,
      failed: unsuccessfulCount(manifest),
      manifest,
      results: manifestResults(manifest),
      ...(unmatchedKeys ? { unmatchedKeys } : {}),
      ...(sendError ? { sendError } : {}),
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
   * @param options - Options including progress callback (Phase 2.2)
   * @returns BulkResult with all created issues and UID mappings
   *
   * @private
   */
  async createBulkHierarchy(
    levels: HierarchyLevel[],
    _uidMap?: Record<string, number>, // Preserved for future retry index mapping
    existingMappings?: Record<string, string>,
    options?: IssuesCreateOptions // Added for progress tracking
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

    const allCreated: Array<{ index: number; key: string }> = [];
    const allFailed: Array<{ index: number; status: number; errors: Record<string, string> }> = [];
    const allValidationErrors: Array<{ index: number; error: Error; blocked?: boolean }> = [];
    const allNotConfirmed: number[] = [];
    const allNotSent: number[] = [];
    const unmatchedKeys: string[] = [];
    let hasUnmatchedKeys = false;
    let sendError: Error | undefined;
    const totalIssues = levels.reduce((sum, level) => sum + level.issues.length, 0);
    const reporter = new BulkProgressReporter(totalIssues, options?.onProgress);

    // Levels run in order; each level's groups run one after another, and
    // every UID→key mapping is recorded before the next level starts.
    for (const level of levels) {
      // After a request threw nothing more is sent, so these rows were never created.
      if (sendError) {
        allNotSent.push(...level.issues.map(issue => issue.index));
        continue;
      }

      // Build payloads for this level (with UID replacement)
      const payloadResults = await Promise.allSettled(
        level.issues.map(async (issue) => {
          try {
            const parent = issue.record.Parent;
            const parentUid = typeof parent === 'string' || typeof parent === 'number'
              ? String(parent)
              : undefined;
            if (
              parentUid &&
              _uidMap &&
              Object.prototype.hasOwnProperty.call(_uidMap, parentUid) &&
              !uidReplacer.getKey(parentUid)
            ) {
              return {
                index: issue.index,
                success: false as const,
                blocked: true as const,
                error: new Error(`Blocked: parent "${parentUid}" has no confirmed created Jira key`),
              };
            }

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
      const errorsBefore = allValidationErrors.length;
      
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
            allValidationErrors.push({
              index: value.index,
              error: value.error,
              ...(value.blocked ? { blocked: true } : {}),
            });
          }
        } else {
          // Promise rejection (shouldn't happen with try/catch)
          allValidationErrors.push({ 
            index: level.issues[0]?.index ?? 0, 
            error: new Error(`Unexpected validation failure: ${result.reason}`) 
          });
        }
      });
      reporter.record(0, allValidationErrors.length - errorsBefore);

      // Skip API call if no valid payloads for this level
      if (validPayloads.length === 0) {
        reporter.flush();
        continue;
      }

      const apiResult = await this.sendInGroups(validPayloads.map(vp => vp.payload), reporter);

      // Process results and record UID→Key mappings for the next level
      // Indices outside this level's payloads are ignored, as in 3.0.x
      apiResult.created.forEach((item) => {
        const validPayload = validPayloads[item.index];
        if (!validPayload) return;
        allCreated.push({ index: validPayload.index, key: item.key });
        if (validPayload.uid) {
          uidReplacer.recordCreation(validPayload.uid, item.key);
        }
      });
      apiResult.failed.forEach((item) => {
        const validPayload = validPayloads[item.index];
        if (validPayload) {
          allFailed.push({ index: validPayload.index, status: item.status, errors: item.errors });
        }
      });
      const remap = (index: number): number[] => {
        const validPayload = validPayloads[index];
        return validPayload ? [validPayload.index] : [];
      };
      allNotConfirmed.push(...apiResult.notConfirmed.flatMap(remap));
      allNotSent.push(...apiResult.notSent.flatMap(remap));
      if (apiResult.unmatchedKeys) {
        hasUnmatchedKeys = true;
        unmatchedKeys.push(...apiResult.unmatchedKeys);
      }
      sendError = apiResult.sendError;
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
      ...(allNotConfirmed.length > 0 ? { notConfirmed: allNotConfirmed } : {}),
      ...(allNotSent.length > 0 ? { notSent: allNotSent } : {}),
      created: createdMap,
      errors: errorsMap,
      uidMap: uidReplacer.getUidMap(), // Include UID mappings for retry
    };

    // Store manifest
    await this.manifestStorage.storeManifest(manifest);
    const sendErrorInfo = toSendError(sendError);

    return {
      manifest,
      total: totalIssues,
      succeeded: allCreated.length,
      failed: unsuccessfulCount(manifest),
      results: [
        ...allCreated.map(item => ({
          index: item.index,
          success: true as const,
          outcome: 'created' as const,
          key: item.key,
        })),
        ...allFailed.map(item => ({
          index: item.index,
          success: false as const,
          outcome: 'failed' as const,
          error: { status: item.status, errors: item.errors },
        })),
        ...allValidationErrors.map(({ index, error, blocked }) => ({
          index,
          success: false as const,
          outcome: 'failed' as const,
          error: { status: 400, errors: { validation: error.message } },
          ...(blocked ? { blocked: true as const } : {}),
        })),
        ...allNotConfirmed.map(index => ({
          index,
          success: false as const,
          outcome: 'not_confirmed' as const,
        })),
        ...allNotSent.map(index => ({
          index,
          success: false as const,
          outcome: 'not_sent' as const,
        })),
      ],
      ...(hasUnmatchedKeys ? { unmatchedKeys } : {}),
      ...(sendErrorInfo ? { sendError: sendErrorInfo } : {}),
    };
  }

  /**
   * Search for issues using human-readable field names and values.
   *
   * This method provides a friendly search API that:
   * - Resolves field names via the schema (e.g., "Risk Level" → "customfield_12345")
   * - Converts values using existing converters (e.g., "John Smith" → user accountId)
   * - Generates optimized JQL queries automatically
   * - Supports fuzzy matching, custom fields, and complex criteria
   *
   * @param criteria - Search criteria with human-readable field names
   * @returns Array of matching issues
   *
   * @example
   * ```typescript
   * // Simple search
   * const issues = await jml.issues.search({
   *   project: "Engineering",
   *   assignee: "John Smith",
   *   status: "In Progress"
   * });
   *
   * // Advanced search with custom fields and date filters
   * const issues = await jml.issues.search({
   *   project: "ENG",
   *   "Risk Level": "High",
   *   labels: ["backend", "urgent"],
   *   createdSince: "2025-02-12",
   *   maxResults: 50,
   *   orderBy: "created DESC"
   * });
   * ```
   */
  async search(criteria: Record<string, unknown>): Promise<Issue[]> {
    return this.issueSearch.search(criteria);
  }

  /**
   * Preview resolved payload without submitting to Jira.
   *
   * Runs the same field resolution, conversion, and Cloud adaptation flow
   * as `create()`, but returns the final payload with resolution metadata
   * instead of POSTing it to Jira.
   *
   * @param input - Single object or array of objects to preview
   * @returns PreviewResult for single input, PreviewResult[] for array
   */
  async preview(input: IssuesCreateInput): Promise<PreviewResult | PreviewResult[]> {
    const cloudAdapter = await this.getCloudAdapter();
    const deploymentFn = async (): Promise<DeploymentType> => this.getDeployment();

    const previewInstance = new PayloadPreview(
      this.client,
      this.schema,
      this.resolver,
      this.converter,
      cloudAdapter,
      this.endpointResolverFn ?? (() => Promise.reject(new Error('No endpoint resolver'))),
      deploymentFn,
      this.cache,
      this.config,
      this.baseUrl
    );

    const normalized = this.normalizeInput(input);
    if (this.detectInputType(normalized) === 'bulk') {
      const records = Array.isArray(normalized) ? normalized : (await this.parseIssueInput(normalized as ParseInputOptions)).data;
      return previewInstance.previewBulk(records.map(record => this.normalizeInput(record) as Record<string, unknown>));
    }
    return previewInstance.preview(normalized as Record<string, unknown>);
  }

  async addAttachments(
    issueKey: string,
    attachments: AttachmentInput[]
  ): Promise<AttachmentUploadResult[]> {
    if (!issueKey || !issueKey.trim()) {
      throw new ValidationError('issueKey must be a non-empty string');
    }

    // AC3: short-circuit before validation and endpoint resolution
    if (attachments.length === 0) {
      return [];
    }

    const validated = await this.attachmentUploader.validate(attachments);
    const endpoint = await this.resolveIssueAttachmentsEndpoint(issueKey);
    return this.attachmentUploader.uploadForIssue(endpoint, validated, issueKey);
  }

  private async getCloudAdapter(): Promise<CloudCreateAdapter | undefined> {
    if (this.cloudAdapter) {
      return this.cloudAdapter;
    }

    if (this.deployment === 'cloud') {
      this.cloudAdapter = new CloudCreateAdapter('cloud');
      return this.cloudAdapter;
    }

    if (this.deployment === 'server') {
      return undefined;
    }

    if (!this.endpointResolverFn) {
      return undefined;
    }

    try {
      const resolver = await this.endpointResolverFn();
      if (resolver.isCloud) {
        this.cloudAdapter = new CloudCreateAdapter('cloud');
      }
    } catch {
      return undefined;
    }

    return this.cloudAdapter;
  }

  private async getDeployment(): Promise<DeploymentType> {
    if (this.deployment && this.deployment !== 'auto') {
      return this.deployment;
    }

    if (this.endpointResolverFn) {
      try {
        const resolver = await this.endpointResolverFn();
        return resolver.isCloud ? 'cloud' : 'server';
      } catch {
        // Fall back to Server/DC default when auto-detection is unavailable
      }
    }

    return 'server';
  }

  /**
   * Adapt payload for Cloud/Server deployment differences.
   * If deployment is 'cloud', converts description to ADF, user fields to accountId, etc.
   * If deployment is 'server' or unknown, passes through unchanged.
   * @private
   */
  private async adaptForDeployment(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const cloudAdapter = await this.getCloudAdapter();
    if (!cloudAdapter) {
      return payload;
    }
    return cloudAdapter.adaptPayload(payload);
  }

  /**
   * Resolve the issue creation endpoint URL.
   * Uses EndpointResolver if available, otherwise falls back to /rest/api/2/issue.
   * @private
   */
  private async resolveIssueCreateEndpoint(): Promise<string> {
    if (this.endpointResolverFn) {
      try {
        const resolver = await this.endpointResolverFn();
        return resolver.issueCreate();
      } catch {
        // Fallback if detection fails
      }
    }
    return '/rest/api/2/issue';
  }

  /**
   * Resolve the attachment endpoint for a created issue.
   */
  private async resolveIssueAttachmentsEndpoint(issueKey: string): Promise<string> {
    if (this.endpointResolverFn) {
      try {
        const resolver = await this.endpointResolverFn();
        return resolver.issueAttachments(issueKey);
      } catch {
        // Fall back if detection fails
      }
    }
    return `/rest/api/2/issue/${encodeURIComponent(issueKey)}/attachments`;
  }

  private rejectBulkAttachments(records: Array<Record<string, unknown>>): void {
    const hasAttachments = records.some((record) =>
      Object.keys(record).some((key) => normalizeFieldName(key) === 'attachments')
    );

    if (hasAttachments) {
      throw new ValidationError(
        'Attachments are supported for single-issue creation only; bulk creation does not support attachments'
      );
    }
  }

  /**
   * Resolve the bulk issue creation endpoint URL.
   * Uses EndpointResolver if available, otherwise falls back to /rest/api/2/issue/bulk.
   * Reserved for use in bulk operations that need dynamic endpoint resolution.
   * @private
   */
  /* istanbul ignore next */
  async resolveBulkCreateEndpoint(): Promise<string> {
    if (this.endpointResolverFn) {
      try {
        const resolver = await this.endpointResolverFn();
        return resolver.issueBulkCreate();
      } catch {
        // Fallback if detection fails
      }
    }
    return '/rest/api/2/issue/bulk';
  }

  /**
   * Send payloads in groups of `bulk.groupSize`, one request at a time,
   * reporting progress after each group that returns.
   * @private
   */
  private async sendInGroups(
    payloads: Array<{ fields: Record<string, unknown> }>,
    reporter?: BulkProgressReporter
  ): Promise<GroupedBulkResult> {
    if (payloads.length === 0) return { created: [], failed: [], notConfirmed: [], notSent: [] };
    const endpoint = await this.resolveBulkCreateEndpoint();
    return createBulkInGroups(this.bulkApiWrapper!, payloads, {
      groupSize: this.bulkGroupSize,
      endpoint,
      onGroup: group => reporter?.report(group.created.length, group.failed.length),
    });
  }
}
