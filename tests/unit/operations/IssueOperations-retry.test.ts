/**
 * Unit Tests: IssueOperations Retry with Manifest
 * Story: E4-S05
 * 
 * Tests retry functionality using cached manifests from previous bulk operations.
 * Uses fixtures and helpers to reduce duplication.
 */

import { IssueOperations } from '../../../src/operations/IssueOperations.js';
import { JiraClient } from '../../../src/client/JiraClient.js';
import { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import { FieldResolver } from '../../../src/converters/FieldResolver.js';
import { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import { BulkResult } from '../../../src/types/bulk.js';
import { RedisCache } from '../../../src/cache/RedisCache.js';
import { 
  createBasicManifest, 
  createMultiFailureManifest, 
  createOldManifest,
  createPartialRetryManifest 
} from '../../fixtures/retry-manifests.js';
import { setupManifestInCache, setupBulkSuccess, setupBulkPartialFailure } from '../../helpers/retry-test-utils.js';
import * as InputParser from '../../../src/parsers/InputParser.js';

describe('IssueOperations - Retry with Manifest (E4-S05)', () => {
  let issueOps: IssueOperations;
  let mockClient: jest.Mocked<JiraClient>;
  let mockSchema: jest.Mocked<SchemaDiscovery>;
  let mockResolver: jest.Mocked<FieldResolver>;
  let mockConverter: jest.Mocked<ConverterRegistry>;
  let mockCache: jest.Mocked<RedisCache>;

  const testInput = [
    { Project: 'ZUL', 'Issue Type': 'Task', Summary: 'Issue 1' },
    { Project: 'ZUL', 'Issue Type': 'Task', Summary: 'Issue 2' },
    { Project: 'ZUL', 'Issue Type': 'Task', Summary: 'Issue 3' },
    { Project: 'ZUL', 'Issue Type': 'Task', Summary: 'Issue 4' },
    { Project: 'ZUL', 'Issue Type': 'Task', Summary: 'Issue 5' },
  ];

  beforeEach(() => {
    mockClient = {
      post: jest.fn(),
      get: jest.fn().mockResolvedValue({ id: '10000', key: 'ZUL', name: 'Zulu Project' }),
    } as any;

    mockSchema = {
      getFieldsForIssueType: jest.fn(),
    } as any;

    mockResolver = {
      resolveFields: jest.fn(),
    } as any;

    mockConverter = {
      convertFields: jest.fn(),
    } as any;

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      lookupIssueType: jest.fn(),
      lookupProject: jest.fn(),
    } as any;

    // Setup default mocks
    mockSchema.getFieldsForIssueType.mockResolvedValue({
      projectKey: 'ZUL',
      issueType: 'Task',
      fields: {
        summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } },
        description: { id: 'description', name: 'Description', type: 'text', required: false, schema: { type: 'string' } },
      },
    });

    mockResolver.resolveFields.mockResolvedValue({
      project: { key: 'ZUL' },
      issuetype: { name: 'Task' },
      summary: 'Test issue',
      description: 'Test description',
    });

    mockConverter.convertFields.mockResolvedValue({
      project: { key: 'ZUL' },
      issuetype: { name: 'Task' },
      summary: 'Test issue',
      description: 'Test description',
    });

    issueOps = new IssueOperations(mockClient, mockSchema, mockResolver, mockConverter, mockCache);
  });

  describe('AC1: Accept Retry Parameter', () => {
    it('should load manifest when retry option provided', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);

      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-2']);

      await issueOps.create(testInput.slice(0, 2), { retry: manifestId });

      // ManifestStorage uses `bulk:manifest:${id}` as key
      expect(mockCache.get).toHaveBeenCalledWith(`bulk:manifest:${manifestId}`);
    });

    it('should throw error if manifest not found', async () => {
      const manifestId = 'bulk-nonexistent';
      mockCache.get = jest.fn().mockResolvedValue(null);

      await expect(issueOps.create(testInput.slice(0, 1), { retry: manifestId })).rejects.toThrow(
        'Manifest bulk-nonexistent not found or expired'
      );
    });

    it('should throw error if manifest is expired', async () => {
      const manifestId = 'bulk-expired';
      mockCache.get = jest.fn().mockResolvedValue(null);

      await expect(issueOps.create(testInput.slice(0, 1), { retry: manifestId })).rejects.toThrow(
        'Manifest bulk-expired not found or expired'
      );
    });

    it('should log warning if manifest is older than 24 hours', async () => {
      const manifestId = 'bulk-old';
      const oldManifest = createOldManifest(manifestId);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      setupManifestInCache(mockCache, oldManifest);
      setupBulkSuccess(mockClient, ['ZUL-124']);

      await issueOps.create(testInput.slice(0, 2), { retry: manifestId });

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('48.0h old'));
      consoleWarnSpy.mockRestore();
    });
  });

  describe('AC2: Filter Input Based on Manifest', () => {
    it('should filter out succeeded row indices from input', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createMultiFailureManifest(manifestId);

      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-3', 'ZUL-5']);

      await issueOps.create(testInput, { retry: manifestId }) as BulkResult;

      // Verify bulk API was called with only 2 payloads (indices 2 and 4 from original)
      expect(mockClient.post).toHaveBeenCalledWith(
        '/rest/api/2/issue/bulk',
        expect.objectContaining({
          issueUpdates: expect.arrayContaining([
            expect.objectContaining({ fields: expect.any(Object) })
          ])
        })
      );
    });

    it('should preserve original row indices for failed rows', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'error' } },
        '2': { status: 400, errors: { field: 'error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkPartialFailure(
        mockClient,
        [{ index: 0, key: 'ZUL-2' }],
        [{ index: 1, status: 400, errors: { field: 'still error' } }]
      );

      const result = await issueOps.create(testInput.slice(0, 3), { retry: manifestId }) as BulkResult;

      // Result should show original indices (1 succeeded, 2 still failed)
      expect(result.manifest.succeeded).toContain(1);
      expect(result.manifest.failed).toContain(2);
    });

    it('should only process rows that previously failed', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'error' } },
        '2': { status: 400, errors: { field: 'error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-2', 'ZUL-3']);

      await issueOps.create(testInput.slice(0, 3), { retry: manifestId });

      // Verify only 1 bulk API call was made (for 2 failed rows)
      expect(mockClient.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC3: Process Failed Rows Only', () => {
    it('should call bulk API with filtered payloads', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'error' } },
        '2': { status: 400, errors: { field: 'error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkPartialFailure(
        mockClient,
        [],
        [
          { index: 0, status: 400, errors: { field: 'still failing' } },
          { index: 1, status: 400, errors: { field: 'still failing' } },
        ]
      );

      await issueOps.create(testInput.slice(0, 3), { retry: manifestId });

      expect(mockClient.post).toHaveBeenCalledTimes(1);
    });

    it('should map results back to original row indices', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createMultiFailureManifest(manifestId);

      setupManifestInCache(mockCache, manifest);
      setupBulkPartialFailure(
        mockClient,
        [
          { index: 0, key: 'ZUL-3' }, // Filtered index 0 → original index 2
          { index: 1, key: 'ZUL-5' }, // Filtered index 1 → original index 4
        ],
        []
      );

      const result = await issueOps.create(testInput, { retry: manifestId }) as BulkResult;

      // Check that results use original indices
      expect(result.manifest.created['2']).toBe('ZUL-3');
      expect(result.manifest.created['4']).toBe('ZUL-5');
    });

    it('should track which retried rows succeeded/failed', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'error' } },
        '2': { status: 400, errors: { field: 'error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkPartialFailure(
        mockClient,
        [{ index: 0, key: 'ZUL-2' }], // Index 1 succeeds
        [{ index: 1, status: 400, errors: { field: 'still error' } }] // Index 2 still fails
      );

      const result = await issueOps.create(testInput.slice(0, 3), { retry: manifestId }) as BulkResult;

      expect(result.manifest.succeeded).toContain(1);
      expect(result.manifest.failed).toContain(2);
      expect(result.manifest.failed).not.toContain(1);
    });
  });

  describe('AC4: Merge Results with Original Manifest', () => {
    it('should update manifest.succeeded with new successes', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'error' } },
        '2': { status: 400, errors: { field: 'error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkPartialFailure(
        mockClient,
        [{ index: 0, key: 'ZUL-2' }],
        [{ index: 1, status: 400, errors: { field: 'still error' } }]
      );

      const result = await issueOps.create(testInput.slice(0, 3), { retry: manifestId }) as BulkResult;

      expect(result.manifest.succeeded).toEqual(expect.arrayContaining([0, 1]));
      expect(result.manifest.succeeded).toHaveLength(2);
    });

    it('should update manifest.failed with remaining failures', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'old error' } },
        '2': { status: 400, errors: { field: 'old error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkPartialFailure(
        mockClient,
        [{ index: 0, key: 'ZUL-2' }], // Row 1 succeeds
        [{ index: 1, status: 400, errors: { field: 'still error' } }] // Row 2 still fails
      );

      const result = await issueOps.create(testInput.slice(0, 3), { retry: manifestId }) as BulkResult;

      expect(result.manifest.failed).toEqual([2]); // Only row 2 remains failed
    });

    it('should update manifest.created with new issue keys', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'error' } },
        '2': { status: 400, errors: { field: 'error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-2', 'ZUL-3']);

      const result = await issueOps.create(testInput.slice(0, 3), { retry: manifestId }) as BulkResult;

      expect(result.manifest.created['0']).toBe('ZUL-1'); // Original
      expect(result.manifest.created['1']).toBe('ZUL-2'); // New
      expect(result.manifest.created['2']).toBe('ZUL-3'); // New
    });

    it('should update manifest.errors with new/updated errors', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'old error' } },
        '2': { status: 400, errors: { field: 'old error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkPartialFailure(
        mockClient,
        [{ index: 0, key: 'ZUL-2' }], // Row 1 succeeds
        [{ index: 1, status: 400, errors: { field: 'new error' } }] // Row 2 new error
      );

      const result = await issueOps.create(testInput.slice(0, 3), { retry: manifestId }) as BulkResult;

      expect(result.manifest.errors['1']).toBeUndefined(); // Row 1 error removed (succeeded)
      expect(result.manifest.errors['2']).toEqual({
        status: 400,
        errors: { field: 'new error' },
      });
    });

    it('should store merged manifest back to Redis', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);

      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-2']);

      await issueOps.create(testInput.slice(0, 2), { retry: manifestId });

      // Verify cache.set was called to store updated manifest
      expect(mockCache.set).toHaveBeenCalled();
    });
  });

  describe('AC5: Return Combined Result', () => {
    it('should return BulkResult with original + new results', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'error' } },
        '2': { status: 400, errors: { field: 'error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkPartialFailure(
        mockClient,
        [{ index: 0, key: 'ZUL-2' }],
        [{ index: 1, status: 400, errors: { field: 'still error' } }]
      );

      const result = await issueOps.create(testInput.slice(0, 3), { retry: manifestId }) as BulkResult;

      expect(result.results).toHaveLength(3); // All 3 rows
      expect(result.results[0]).toMatchObject({ index: 0, success: true, key: 'ZUL-1' });
      expect(result.results[1]).toMatchObject({ index: 1, success: true, key: 'ZUL-2' });
      expect(result.results[2]).toMatchObject({ index: 2, success: false });
    });

    it('should include all original rows in total count', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createMultiFailureManifest(manifestId);

      setupManifestInCache(mockCache, manifest);
      setupBulkPartialFailure(
        mockClient,
        [
          { index: 0, key: 'ZUL-3' },
          { index: 1, key: 'ZUL-5' },
        ],
        []
      );

      const result = await issueOps.create(testInput, { retry: manifestId }) as BulkResult;

      expect(result.total).toBe(5); // All 5 original rows
    });

    it('should use same manifest ID throughout retry chain', async () => {
      const manifestId = 'bulk-original-id';
      const manifest = createBasicManifest(manifestId);

      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-2']);

      const result = await issueOps.create(testInput.slice(0, 2), { retry: manifestId }) as BulkResult;

      expect(result.manifest.id).toBe(manifestId); // Same ID as original
    });

    it('should calculate succeeded count as original + retry successes', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'error' } },
        '2': { status: 400, errors: { field: 'error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-2', 'ZUL-3']);

      const result = await issueOps.create(testInput.slice(0, 3), { retry: manifestId }) as BulkResult;

      expect(result.succeeded).toBe(3); // 1 original + 2 retry successes
    });

    it('should only include remaining failures in failed count', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createPartialRetryManifest(manifestId);

      setupManifestInCache(mockCache, manifest);
      setupBulkPartialFailure(
        mockClient,
        [{ index: 0, key: 'ZUL-3' }],
        [{ index: 1, status: 400, errors: { field: 'still error' } }]
      );

      const result = await issueOps.create(testInput.slice(0, 4), { retry: manifestId }) as BulkResult;

      expect(result.failed).toBe(1); // Only 1 still failed
    });
  });

  describe('Branch coverage: guard rails and edge cases', () => {
    it('should require cache to be configured before retry operations', async () => {
      const issueOpsWithoutCache = new IssueOperations(
        mockClient,
        mockSchema,
        mockResolver,
        mockConverter
      );

      await expect(
        issueOpsWithoutCache.create(testInput, { retry: 'bulk-missing' })
      ).rejects.toThrow('Bulk operations require cache to be configured');
    });

    it('should return manifest summary immediately when no failed rows remain', async () => {
      const manifest = createBasicManifest('bulk-complete');
      manifest.failed = [];
      manifest.errors = {};

      setupManifestInCache(mockCache, manifest);

      const result = await issueOps.create(testInput.slice(0, 1), { retry: manifest.id }) as BulkResult;

      expect(result.failed).toBe(0);
      expect(result.succeeded).toBe(manifest.succeeded.length);
      expect(result.results).toHaveLength(manifest.succeeded.length);
    });

    it('should parse retry input when parse options are provided', async () => {
      const manifest = createPartialRetryManifest('bulk-parse');
      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-3', 'ZUL-4']);

      const parseInputSpy = jest
        .spyOn(InputParser, 'parseInput')
        .mockResolvedValue({
          data: testInput,
          format: 'json',
          source: 'string',
        });

      const parseOptions = { data: 'placeholder', format: 'json' as const };

      await issueOps.create(parseOptions as any, { retry: manifest.id });

      expect(parseInputSpy).toHaveBeenCalledWith(parseOptions);
      parseInputSpy.mockRestore();
    });

    it('should handle retries where all filtered rows fail validation', async () => {
      const manifest = createPartialRetryManifest('bulk-validation');
      setupManifestInCache(mockCache, manifest);

      const createSingleSpy = jest
        .spyOn(issueOps as any, 'createSingle')
        .mockImplementation(() => {
          throw new Error('Validation failed');
        });

      const result = await issueOps.create(testInput.slice(0, 4), { retry: manifest.id }) as BulkResult;

      expect(mockClient.post).not.toHaveBeenCalled();
      expect(result.failed).toBe(manifest.failed.length);
      const failedIndex = manifest.failed[0]!;
      expect(result.manifest.errors[failedIndex]).toBeDefined();
      expect(result.manifest.errors[failedIndex].errors.validation).toContain('Validation failed');

      createSingleSpy.mockRestore();
    });

    it('should throw descriptive error when bulk API returns unmapped indexes', async () => {
      const manifest = createPartialRetryManifest('bulk-remap');
      manifest.failed = [0];
      manifest.errors = { '0': { status: 400, errors: { field: 'error' } } };
      setupManifestInCache(mockCache, manifest);

      (issueOps as any).bulkApiWrapper = {
        createBulk: jest.fn().mockResolvedValue({
          created: [
            {
              index: 99,
              key: 'ZUL-999',
              id: '100099',
              self: 'https://jira/rest/api/2/issue/100099',
            },
          ],
          failed: [],
        }),
      };

      await expect(
        issueOps.create(testInput.slice(0, 1), { retry: manifest.id })
      ).rejects.toThrow(/Failed to map filtered index 99/);
    });
  });

  describe('AC6: Handle Multiple Retries', () => {
    it('should support retrying same manifest multiple times', async () => {
      const manifestId = 'bulk-abc123';
      
      // First retry
      const manifest1 = createPartialRetryManifest(manifestId);
      setupManifestInCache(mockCache, manifest1);
      setupBulkPartialFailure(
        mockClient,
        [{ index: 0, key: 'ZUL-3' }],
        [{ index: 1, status: 400, errors: { field: 'error' } }]
      );

      await issueOps.create(testInput.slice(0, 4), { retry: manifestId });

      // Second retry
      const manifest2 = createPartialRetryManifest(manifestId);
      manifest2.succeeded = [0, 1, 2];
      manifest2.failed = [3];
      manifest2.created = { '0': 'ZUL-1', '1': 'ZUL-2', '2': 'ZUL-3' };
      manifest2.errors = { '3': { status: 400, errors: { field: 'error' } } };

      setupManifestInCache(mockCache, manifest2);
      setupBulkSuccess(mockClient, ['ZUL-4']);

      const result = await issueOps.create(testInput.slice(0, 4), { retry: manifestId }) as BulkResult;

      expect(result.manifest.succeeded).toHaveLength(4); // 0, 1, 2, 3
      expect(result.manifest.failed).toHaveLength(0);
    });

    it('should process only remaining failed rows on each retry', async () => {
      const manifestId = 'bulk-abc123';
      
      // Manifest with 2 failures
      const manifest = createPartialRetryManifest(manifestId);
      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-3', 'ZUL-4']);

      await issueOps.create(testInput.slice(0, 4), { retry: manifestId });

      // Should have called bulk API with 2 rows only
      expect(mockClient.post).toHaveBeenCalledTimes(1);
    });

    it('should accumulate all successes across retries', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createMultiFailureManifest(manifestId);

      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-3', 'ZUL-5']);

      const result = await issueOps.create(testInput, { retry: manifestId }) as BulkResult;

      expect(result.manifest.succeeded).toHaveLength(5); // All 5 succeeded
      expect(result.manifest.failed).toHaveLength(0);
    });

    it('should stop when no failed rows remain', async () => {
      const manifestId = 'bulk-abc123';
      const manifest = createBasicManifest(manifestId);
      manifest.total = 3;
      manifest.failed = [1, 2];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'error' } },
        '2': { status: 400, errors: { field: 'error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-2', 'ZUL-3']);

      const result = await issueOps.create(testInput.slice(0, 3), { retry: manifestId }) as BulkResult;

      expect(result.manifest.succeeded).toHaveLength(3); // All succeeded
      expect(result.manifest.failed).toHaveLength(0); // None failed
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
    });
  });

  // E4-S13 AC8: Hierarchy-aware retry
  describe('E4-S13 AC8: Hierarchy-aware Retry', () => {
    const hierarchyInput = [
      { uid: 'epic-1', Project: 'ZUL', 'Issue Type': 'Epic', Summary: 'Epic 1' },
      { uid: 'task-1', Project: 'ZUL', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'epic-1' },
      { uid: 'task-2', Project: 'ZUL', 'Issue Type': 'Task', Summary: 'Task 2', Parent: 'epic-1' },
    ];

    it('should route to hierarchy retry when manifest has uidMap', async () => {
      const manifestId = 'bulk-hier-123';
      // Manifest with uidMap indicates previous hierarchy operation
      const manifest = {
        id: manifestId,
        timestamp: Date.now(),
        total: 3,
        succeeded: [0],      // Epic succeeded
        failed: [1, 2],      // Tasks failed
        created: { '0': 'ZUL-100' },
        errors: {
          '1': { status: 400, errors: { parent: 'Invalid parent' } },
          '2': { status: 400, errors: { parent: 'Invalid parent' } },
        },
        uidMap: { 'epic-1': 'ZUL-100' }, // This triggers hierarchy retry
      };

      setupManifestInCache(mockCache, manifest);

      // Mock bulk API success for retry
      mockClient.post.mockResolvedValueOnce({
        issues: [
          { key: 'ZUL-101', id: '10101', self: 'https://...' },
          { key: 'ZUL-102', id: '10102', self: 'https://...' }
        ],
        errors: []
      });

      const result = await issueOps.create(hierarchyInput, { retry: manifestId }) as BulkResult;

      // Should succeed with merged manifest
      expect(result.succeeded).toBe(3); // Epic + 2 tasks
      expect(result.failed).toBe(0);
      expect(result.manifest.uidMap).toBeDefined();
      expect(result.manifest.uidMap!['epic-1']).toBe('ZUL-100');
    });

    it('should use existing UID mappings when retrying hierarchy', async () => {
      const manifestId = 'bulk-hier-456';
      const manifest = {
        id: manifestId,
        timestamp: Date.now(),
        total: 2,
        succeeded: [0],
        failed: [1],
        created: { '0': 'ZUL-200' },
        errors: {
          '1': { status: 500, errors: { server: 'Temporary error' } },
        },
        uidMap: { 'epic-1': 'ZUL-200' },
      };

      setupManifestInCache(mockCache, manifest);

      // Mock bulk success for the child task
      mockClient.post.mockResolvedValueOnce({
        issues: [{ key: 'ZUL-201', id: '10201', self: 'https://...' }],
        errors: []
      });

      const result = await issueOps.create(hierarchyInput.slice(0, 2), { retry: manifestId }) as BulkResult;

      // UID replacement should use existing mapping
      expect(result.manifest.uidMap!['epic-1']).toBe('ZUL-200');
      expect(result.manifest.uidMap!['task-1']).toBe('ZUL-201');
    });

    it('should handle partial failure during hierarchy retry', async () => {
      const manifestId = 'bulk-hier-789';
      const manifest = {
        id: manifestId,
        timestamp: Date.now(),
        total: 3,
        succeeded: [0],
        failed: [1, 2],
        created: { '0': 'ZUL-300' },
        errors: {
          '1': { status: 500, errors: { server: 'Error' } },
          '2': { status: 500, errors: { server: 'Error' } },
        },
        uidMap: { 'epic-1': 'ZUL-300' },
      };

      setupManifestInCache(mockCache, manifest);

      // Mock partial failure: task-1 succeeds, task-2 fails
      mockClient.post.mockResolvedValueOnce({
        issues: [{ key: 'ZUL-301', id: '10301', self: 'https://...' }],
        errors: [{
          status: 400,
          failedElementNumber: 1,
          elementErrors: { errors: { summary: 'Invalid summary' } }
        }]
      });

      const result = await issueOps.create(hierarchyInput, { retry: manifestId }) as BulkResult;

      expect(result.succeeded).toBe(2); // Epic + task-1
      expect(result.failed).toBe(1);    // task-2 still failed
    });

    it('should fall back to flat retry when manifest has no uidMap', async () => {
      const manifestId = 'bulk-flat-123';
      // Manifest WITHOUT uidMap = flat bulk, not hierarchy
      const manifest = createBasicManifest(manifestId);
      manifest.total = 2;
      manifest.failed = [1];
      manifest.errors = {
        '1': { status: 400, errors: { field: 'error' } },
      };

      setupManifestInCache(mockCache, manifest);
      setupBulkSuccess(mockClient, ['ZUL-2']);

      const result = await issueOps.create(testInput.slice(0, 2), { retry: manifestId }) as BulkResult;

      // Should succeed through flat retry path
      expect(result.succeeded).toBe(2);
      expect(result.manifest.uidMap).toBeUndefined(); // No uidMap for flat bulk
    });

    it('should handle empty failed rows on hierarchy retry', async () => {
      const manifestId = 'bulk-hier-empty';
      // All rows already succeeded
      const manifest = {
        id: manifestId,
        timestamp: Date.now(),
        total: 2,
        succeeded: [0, 1],
        failed: [],
        created: { '0': 'ZUL-400', '1': 'ZUL-401' },
        errors: {},
        uidMap: { 'epic-1': 'ZUL-400', 'task-1': 'ZUL-401' },
      };

      setupManifestInCache(mockCache, manifest);

      const result = await issueOps.create(hierarchyInput.slice(0, 2), { retry: manifestId }) as BulkResult;

      // No API calls needed, return existing state
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('should handle multi-level retry when failed records have hierarchy', async () => {
      // Scenario: Epic succeeded but Story and its child Task both failed
      // Story is parent of Task, creating 2 levels in the retry set
      const multiLevelHierarchyInput = [
        { uid: 'epic-1', Project: 'ZUL', 'Issue Type': 'Epic', Summary: 'Epic 1' },
        { uid: 'story-1', Project: 'ZUL', 'Issue Type': 'Story', Summary: 'Story 1', Parent: 'epic-1' },
        { uid: 'task-1', Project: 'ZUL', 'Issue Type': 'Task', Summary: 'Task 1', Parent: 'story-1' },
      ];

      const manifestId = 'bulk-multilevel-123';
      const manifest = {
        id: manifestId,
        timestamp: Date.now(),
        total: 3,
        succeeded: [0],      // Epic succeeded
        failed: [1, 2],      // Story and Task failed (forming 2 levels)
        created: { '0': 'ZUL-500' },
        errors: {
          '1': { status: 500, errors: { server: 'Temporary error' } },
          '2': { status: 500, errors: { server: 'Temporary error' } },
        },
        uidMap: { 'epic-1': 'ZUL-500' },
      };

      setupManifestInCache(mockCache, manifest);

      // Setup mocks for different issue types
      mockSchema.getFieldsForIssueType.mockImplementation(async (projectKey, issueType) => ({
        projectKey,
        issueType,
        fields: {
          summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } },
        },
      }));

      mockResolver.resolveFields.mockImplementation(async (projectKey, issueType, record) => ({
        project: { key: projectKey },
        issuetype: { name: issueType },
        summary: record.Summary,
        parent: record.Parent ? { key: record.Parent } : undefined,
      }));

      mockConverter.convertFields.mockImplementation(async (schema, fields) => fields);

      // Mock bulk API responses for each level
      // Level 0: Story (parent is epic-1 which is external/succeeded)
      mockClient.post.mockResolvedValueOnce({
        issues: [{ key: 'ZUL-501', id: '10501', self: 'https://...' }],
        errors: []
      });
      // Level 1: Task (parent is story-1)
      mockClient.post.mockResolvedValueOnce({
        issues: [{ key: 'ZUL-502', id: '10502', self: 'https://...' }],
        errors: []
      });

      const result = await issueOps.create(multiLevelHierarchyInput, { retry: manifestId }) as BulkResult;

      // Should have called bulk API twice (once per level)
      expect(mockClient.post).toHaveBeenCalledTimes(2);
      
      // Should succeed with all issues
      expect(result.succeeded).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.manifest.uidMap).toBeDefined();
      expect(result.manifest.uidMap!['story-1']).toBe('ZUL-501');
      expect(result.manifest.uidMap!['task-1']).toBe('ZUL-502');
    });

    it('should merge multi-level retry results back to original manifest indices', async () => {
      // 4-level deep hierarchy: Epic -> Feature -> Story -> Task
      // All but Epic failed, creating 3 levels in retry
      const deepHierarchyInput = [
        { uid: 'epic-1', Project: 'ZUL', 'Issue Type': 'Epic', Summary: 'Epic' },
        { uid: 'feature-1', Project: 'ZUL', 'Issue Type': 'Story', Summary: 'Feature', Parent: 'epic-1' },
        { uid: 'story-1', Project: 'ZUL', 'Issue Type': 'Story', Summary: 'Story', Parent: 'feature-1' },
        { uid: 'task-1', Project: 'ZUL', 'Issue Type': 'Task', Summary: 'Task', Parent: 'story-1' },
      ];

      const manifestId = 'bulk-deep-456';
      const manifest = {
        id: manifestId,
        timestamp: Date.now(),
        total: 4,
        succeeded: [0],
        failed: [1, 2, 3],
        created: { '0': 'ZUL-600' },
        errors: {
          '1': { status: 500, errors: { server: 'Error' } },
          '2': { status: 500, errors: { server: 'Error' } },
          '3': { status: 500, errors: { server: 'Error' } },
        },
        uidMap: { 'epic-1': 'ZUL-600' },
      };

      setupManifestInCache(mockCache, manifest);

      // Setup mocks for different issue types
      mockSchema.getFieldsForIssueType.mockImplementation(async (projectKey, issueType) => ({
        projectKey,
        issueType,
        fields: {
          summary: { id: 'summary', name: 'Summary', type: 'string', required: true, schema: { type: 'string' } },
        },
      }));

      mockResolver.resolveFields.mockImplementation(async (projectKey, issueType, record) => ({
        project: { key: projectKey },
        issuetype: { name: issueType },
        summary: record.Summary,
        parent: record.Parent ? { key: record.Parent } : undefined,
      }));

      mockConverter.convertFields.mockImplementation(async (schema, fields) => fields);

      // Mock responses for 3 levels
      mockClient.post
        .mockResolvedValueOnce({
          issues: [{ key: 'ZUL-601', id: '10601', self: 'https://...' }],
          errors: []
        })
        .mockResolvedValueOnce({
          issues: [{ key: 'ZUL-602', id: '10602', self: 'https://...' }],
          errors: []
        })
        .mockResolvedValueOnce({
          issues: [{ key: 'ZUL-603', id: '10603', self: 'https://...' }],
          errors: []
        });

      const result = await issueOps.create(deepHierarchyInput, { retry: manifestId }) as BulkResult;

      // 3 bulk API calls (one per level)
      expect(mockClient.post).toHaveBeenCalledTimes(3);
      
      // All succeeded
      expect(result.succeeded).toBe(4);
      expect(result.failed).toBe(0);
      
      // Original indices preserved in manifest
      expect(result.manifest.created['0']).toBe('ZUL-600');
      expect(result.manifest.created['1']).toBe('ZUL-601');
      expect(result.manifest.created['2']).toBe('ZUL-602');
      expect(result.manifest.created['3']).toBe('ZUL-603');
    });
  });
});
