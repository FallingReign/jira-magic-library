import { IssueOperations } from '../../../src/operations/IssueOperations.js';
import { JiraClient } from '../../../src/client/JiraClient.js';
import { SchemaDiscovery } from '../../../src/schema/SchemaDiscovery.js';
import { FieldResolver } from '../../../src/converters/FieldResolver.js';
import { ConverterRegistry } from '../../../src/converters/ConverterRegistry.js';
import type { LookupCache } from '../../../src/types/converter.js';
import { parseInput } from '../../../src/parsers/InputParser.js';
import { preprocessHierarchyRecords } from '../../../src/operations/bulk/HierarchyPreprocessor.js';

jest.mock('../../../src/parsers/InputParser');
jest.mock('../../../src/operations/bulk/HierarchyPreprocessor');

describe('IssueOperations coverage paths', () => {
  let issueOps: IssueOperations;
  let mockClient: jest.Mocked<JiraClient>;
  let mockSchema: jest.Mocked<SchemaDiscovery>;
  let mockResolver: jest.Mocked<FieldResolver>;
  let mockConverter: jest.Mocked<ConverterRegistry>;
  let mockCache: jest.Mocked<LookupCache>;

  beforeEach(() => {
    (parseInput as jest.Mock).mockReset();
    (preprocessHierarchyRecords as jest.Mock).mockReset();

    mockClient = {
      post: jest.fn(),
      get: jest.fn(),
    } as any;

    mockSchema = {
      getFieldsForIssueType: jest.fn(),
    } as any;

    mockResolver = {
      resolveFields: jest.fn(),
      resolveFieldsWithExtraction: jest.fn(),
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

    (preprocessHierarchyRecords as jest.Mock).mockResolvedValue({
      hasHierarchy: false,
      levels: [],
      uidMap: {},
    });

    issueOps = new IssueOperations(
      mockClient,
      mockSchema,
      mockResolver,
      mockConverter,
      mockCache
    );

    // Stub bulk API wrapper to avoid exercising real client logic
    (issueOps as any).bulkApiWrapper = {
      createBulk: jest.fn().mockResolvedValue({ created: [], failed: [] }),
    };

    jest.spyOn(issueOps as any, 'createSingle').mockResolvedValue({
      fields: {
        project: { key: 'ENG' },
        issuetype: { name: 'Bug' },
        summary: 'Parsed summary',
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should parse bulk input when parse options are provided', async () => {
    const parsedRecords = [
      { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Parsed issue' },
    ];

    (parseInput as jest.Mock).mockResolvedValue({
      data: parsedRecords,
      format: 'json',
      source: 'string',
    });

    (issueOps as any).bulkApiWrapper.createBulk.mockResolvedValueOnce({
      created: [{ index: 0, key: 'ENG-101', id: '101', self: 'http://example.com' }],
      failed: [],
    });

    const result = await issueOps.create({ data: '[]', format: 'json' } as any);

    expect(parseInput).toHaveBeenCalledWith({ data: '[]', format: 'json' });
    expect((issueOps as any).bulkApiWrapper.createBulk).toHaveBeenCalled();
    expect(result.manifest.created['0']).toBe('ENG-101');
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('should use preprocessed level data when hierarchy is detected with a single level', async () => {
    (preprocessHierarchyRecords as jest.Mock).mockResolvedValueOnce({
      hasHierarchy: true,
      levels: [
        {
          issues: [
            { index: 0, record: { Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Hierarchy issue' } },
          ],
        },
      ],
      uidMap: {},
    });

    (issueOps as any).bulkApiWrapper.createBulk.mockResolvedValueOnce({
      created: [{ index: 0, key: 'ENG-200', id: '200', self: 'http://example.com' }],
      failed: [],
    });

    const result = await issueOps.create([{ Project: 'IGNORED' }] as any);

    expect(preprocessHierarchyRecords).toHaveBeenCalled();
    expect(result.manifest.created['0']).toBe('ENG-200');
    expect(result.succeeded).toBe(1);
  });

  it('should surface unexpected validation failures when payload build rejects', async () => {
    const rejectionSpy = jest
      .spyOn(Promise, 'allSettled')
      .mockResolvedValueOnce([
        { status: 'rejected', reason: 'boom' } as PromiseRejectedResult,
      ]);

    await expect(
      issueOps.create([{ Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Bad row' }])
    ).rejects.toThrow('Unexpected validation failure: boom');

    rejectionSpy.mockRestore();
  });

  it('should throw the first validation error when all bulk records fail', async () => {
    const rejectionSpy = jest
      .spyOn(Promise, 'allSettled')
      .mockResolvedValueOnce([
        { status: 'fulfilled', value: { index: 0, success: false as const, error: new Error('invalid record') } },
      ]);

    await expect(
      issueOps.create([{ Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Invalid' }])
    ).rejects.toThrow('invalid record');

    rejectionSpy.mockRestore();
  });

  it('should surface validation error when createSingle fails for every bulk record', async () => {
    jest.spyOn(issueOps as any, 'createSingle').mockImplementation(() => {
      throw new Error('bulk validation failed');
    });

    await expect(
      issueOps.create([{ Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Bad' }])
    ).rejects.toThrow('bulk validation failed');
  });

  it('should handle rejected payload builds inside createBulkHierarchy', async () => {
    const rejectionSpy = jest
      .spyOn(Promise, 'allSettled')
      .mockResolvedValueOnce([
        { status: 'rejected', reason: 'level failure' } as PromiseRejectedResult,
      ]);

    const result = await issueOps.createBulkHierarchy([
      { issues: [{ index: 0, record: { uid: 'u1', Project: 'ENG', 'Issue Type': 'Bug' } }] },
    ]);

    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      index: 0,
      success: false,
    });
    expect(result.results[0]?.error?.errors?.validation).toContain('Unexpected validation failure');

    rejectionSpy.mockRestore();
  });

  it('should record successes, API failures, and validation errors in createBulkHierarchy', async () => {
    const createSingleSpy = jest
      .spyOn(issueOps as any, 'createSingle')
      .mockImplementationOnce(async (record: any) => ({ fields: { summary: record.Summary } }))
      .mockImplementationOnce(async (record: any) => ({ fields: { summary: record.Summary } }))
      .mockImplementationOnce(async () => { throw new Error('validation explode'); });

    (issueOps as any).bulkApiWrapper.createBulk.mockResolvedValueOnce({
      created: [{ index: 0, key: 'ENG-300', id: '300', self: 'http://example.com' }],
      failed: [{ index: 1, status: 400, errors: { summary: 'bad summary' } }],
    });

    const result = await issueOps.createBulkHierarchy([
      {
        issues: [
          { index: 0, record: { uid: 'u1', Project: 'ENG', 'Issue Type': 'Task', Summary: 'First' } },
          { index: 1, record: { uid: 'u2', Project: 'ENG', 'Issue Type': 'Task', Summary: 'Second' } },
          { index: 2, record: { uid: 'u3', Project: 'ENG', 'Issue Type': 'Task', Summary: 'Third' } },
        ],
      },
    ]);

    expect(createSingleSpy).toHaveBeenCalledTimes(3);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, success: true, key: 'ENG-300' }),
        expect.objectContaining({ index: 1, success: false, error: { status: 400, errors: { summary: 'bad summary' } } }),
        expect.objectContaining({ index: 2, success: false, error: expect.objectContaining({ errors: expect.any(Object) }) }),
      ])
    );
  });

  it('should process successful hierarchy level with all payloads valid', async () => {
    jest.spyOn(issueOps as any, 'createSingle').mockImplementation(async (record: any) => ({
      fields: { project: { key: record.Project }, issuetype: { name: record['Issue Type'] }, summary: record.Summary },
    }));

    (issueOps as any).bulkApiWrapper.createBulk.mockResolvedValueOnce({
      created: [
        { index: 0, key: 'ENG-400', id: '400', self: 'http://example.com' },
        { index: 1, key: 'ENG-401', id: '401', self: 'http://example.com' },
      ],
      failed: [],
    });

    const result = await issueOps.createBulkHierarchy([
      {
        issues: [
          { index: 0, record: { uid: 'u1', Project: 'ENG', 'Issue Type': 'Bug', Summary: 'One' } },
          { index: 1, record: { uid: 'u2', Project: 'ENG', 'Issue Type': 'Bug', Summary: 'Two' } },
        ],
      },
    ]);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, success: true, key: 'ENG-400' }),
        expect.objectContaining({ index: 1, success: true, key: 'ENG-401' }),
      ])
    );
  });

  it('should require cache for createBulkHierarchy when dependencies are missing', async () => {
    const issueOpsWithoutCache = new IssueOperations(
      mockClient,
      mockSchema,
      mockResolver,
      mockConverter
    );

    await expect(
      issueOpsWithoutCache.createBulkHierarchy([])
    ).rejects.toThrow('Bulk operations require cache to be configured');
  });
});
