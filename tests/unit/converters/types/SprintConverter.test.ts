/**
 * Unit tests for Sprint Type Converter
 *
 * Sprint is a special JIRA field (schema.custom = "com.pyxis.greenhopper.jira:gh-sprint").
 * Despite createmeta reporting it as array/string, JIRA Server/DC requires a plain integer
 * sprint ID as the write value.
 *
 * The converter resolves:
 * - Integer (number): fast path, no API call
 * - Numeric string (from CSV: "13772"): fast path, parses to integer
 * - Sprint name ("Sprint 1"): lookup via /rest/agile/1.0 API with caching
 * - Object { id: ... }: passthrough
 * - null/undefined: passthrough (optional field)
 */

import { convertSprintType } from '../../../../src/converters/types/SprintConverter.js';
import type { FieldSchema } from '../../../../src/types/schema.js';
import type { ConversionContext } from '../../../../src/types/converter.js';
import { ValidationError } from '../../../../src/errors/ValidationError.js';
import { createMockContext, createMockClient, createMockCache, mockLookupResult } from '../../../helpers/test-utils.js';
import type { JiraClient } from '../../../../src/client/JiraClient.js';

const sprintFieldSchema: FieldSchema = {
  id: 'customfield_10101',
  name: 'Sprint',
  type: 'sprint',
  required: false,
  schema: {
    type: 'array',
    items: 'string',
    custom: 'com.pyxis.greenhopper.jira:gh-sprint',
    customId: 10101,
  },
};

const MOCK_BOARDS = { values: [{ id: 1, name: 'Board 1' }, { id: 2, name: 'Board 2' }], isLast: true };
const MOCK_SPRINTS_BOARD_1 = {
  values: [
    { id: 13772, name: 'Sprint 1', state: 'active', originBoardId: 1 },
    { id: 13773, name: 'Sprint 2', state: 'future', originBoardId: 1 },
  ],
  isLast: true,
};
const MOCK_SPRINTS_BOARD_2 = {
  values: [
    { id: 13774, name: 'Sprint 3', state: 'closed', originBoardId: 2 },
  ],
  isLast: true,
};

function createContextWithClient(overrides?: Partial<ConversionContext>): {
  context: ConversionContext;
  mockClient: jest.Mocked<Partial<JiraClient>>;
  mockCache: ReturnType<typeof createMockCache>;
} {
  const mockClient = createMockClient();
  const mockCache = createMockCache();
  const context = createMockContext({
    cache: mockCache as any,
    client: mockClient as JiraClient,
    ...overrides,
  });
  return { context, mockClient, mockCache };
}

describe('SprintConverter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AC1: Optional field handling', () => {
    it('should return null unchanged', async () => {
      const { context } = createContextWithClient();
      const result = await convertSprintType(null, sprintFieldSchema, context);
      expect(result).toBeNull();
    });

    it('should return undefined unchanged', async () => {
      const { context } = createContextWithClient();
      const result = await convertSprintType(undefined, sprintFieldSchema, context);
      expect(result).toBeUndefined();
    });
  });

  describe('AC2: Integer fast path (no API call)', () => {
    it('should pass through integer number directly', async () => {
      const { context, mockClient } = createContextWithClient();
      const result = await convertSprintType(13772, sprintFieldSchema, context);
      expect(result).toBe(13772);
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should pass through 0 as a valid integer', async () => {
      const { context } = createContextWithClient();
      const result = await convertSprintType(0, sprintFieldSchema, context);
      expect(result).toBe(0);
    });

    it('should throw ValidationError for float input', async () => {
      const { context } = createContextWithClient();
      await expect(convertSprintType(13772.9, sprintFieldSchema, context))
        .rejects.toThrow(ValidationError);
      await expect(convertSprintType(13772.9, sprintFieldSchema, context))
        .rejects.toThrow(/integer/i);
    });
  });

  describe('AC3: Numeric string fast path (CSV input, no API call)', () => {
    it('should parse numeric string to integer', async () => {
      const { context, mockClient } = createContextWithClient();
      const result = await convertSprintType('13772', sprintFieldSchema, context);
      expect(result).toBe(13772);
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should handle numeric string with whitespace', async () => {
      const { context } = createContextWithClient();
      const result = await convertSprintType(' 13772 ', sprintFieldSchema, context);
      expect(result).toBe(13772);
    });

    it('should throw ValidationError for float string', async () => {
      const { context } = createContextWithClient();
      await expect(convertSprintType('13772.9', sprintFieldSchema, context))
        .rejects.toThrow(ValidationError);
      await expect(convertSprintType('13772.9', sprintFieldSchema, context))
        .rejects.toThrow(/integer/i);
    });

    it('should throw ValidationError for empty string', async () => {
      const { context } = createContextWithClient();
      await expect(convertSprintType('', sprintFieldSchema, context))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for whitespace-only string', async () => {
      const { context } = createContextWithClient();
      await expect(convertSprintType('   ', sprintFieldSchema, context))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('AC4: Object passthrough (already resolved)', () => {
    it('should extract integer id from { id: number } object', async () => {
      const { context, mockClient } = createContextWithClient();
      const result = await convertSprintType({ id: 13772 }, sprintFieldSchema, context);
      expect(result).toBe(13772);
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should extract integer id from { id: string } object', async () => {
      const { context } = createContextWithClient();
      const result = await convertSprintType({ id: '13772' }, sprintFieldSchema, context);
      expect(result).toBe(13772);
    });
  });

  describe('AC5: Sprint name lookup — cache miss (fetches from Agile API)', () => {
    it('should call boards API then sprint API and return matched ID', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();

      // Sprint cache miss, then board hint miss
      mockCache.getLookup
        .mockResolvedValueOnce({ value: null, isStale: false })   // sprint cache miss
        .mockResolvedValueOnce({ value: null, isStale: false });   // board hint miss (in prioritiseBoardsByHint)

      // No hint → boards sorted by id DESC → board 2 first.
      // Supply Sprint 1 on board 2 so only one sprint API call is needed.
      const mockSprintsBoard2WithSprint1 = {
        values: [{ id: 13772, name: 'Sprint 1', state: 'active', originBoardId: 2 }],
        isLast: true,
      };
      (mockClient.get as jest.Mock)
        .mockResolvedValueOnce(MOCK_BOARDS)                     // /rest/agile/1.0/board
        .mockResolvedValueOnce(mockSprintsBoard2WithSprint1);   // board 2 sprints (early exit)

      const result = await convertSprintType('Sprint 1', sprintFieldSchema, context);
      expect(result).toBe(13772);

      // Should have fetched boards
      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/agile/1.0/board',
        expect.objectContaining({ projectKeyOrId: 'TEST' })
      );
      // Should have cached the partial result
      expect(mockCache.setLookup).toHaveBeenCalledWith('TEST', 'sprint', expect.any(Array), undefined);
      // Should have fired background full-fetch via refreshOnce
      expect(mockCache.refreshOnce).toHaveBeenCalledWith(
        expect.stringContaining('sprint:TEST'),
        expect.any(Function)
      );
    });

    it('should exit board loop early when sprint found (not fetch all boards)', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();
      // First getLookup = sprint cache miss, second = board hint miss
      mockCache.getLookup
        .mockResolvedValueOnce({ value: null, isStale: false })   // sprint cache miss
        .mockResolvedValueOnce({ value: null, isStale: false });   // board hint miss

      // With no hint boards are sorted id-DESC: board 2 (id=2) then board 1 (id=1).
      // Sprint 1 is on board 1 — provide board 2 responding with empty, then board 1.
      const emptyBoardResponse = { values: [], isLast: true };
      (mockClient.get as jest.Mock)
        .mockResolvedValueOnce(MOCK_BOARDS)          // boards API
        .mockResolvedValueOnce(emptyBoardResponse)   // board 2 (id=2, checked first, no sprints)
        .mockResolvedValueOnce(MOCK_SPRINTS_BOARD_1); // board 1 (id=1, contains Sprint 1 → early exit)

      const result = await convertSprintType('Sprint 1', sprintFieldSchema, context);
      expect(result).toBe(13772);

      // Only 2 sprint endpoint calls (board 2 + board 1); board 2 had no match and board
      // 1 triggered early exit — board 2's sprint endpoint was still necessarily fetched
      const getCalls = (mockClient.get as jest.Mock).mock.calls;
      const sprintEndpointCalls = getCalls.filter(([url]) =>
        typeof url === 'string' && url.includes('/sprint')
      );
      // Board 2 checked (no match), board 1 checked (match + early exit)
      expect(sprintEndpointCalls).toHaveLength(2);
    });

    it('should resolve sprint name case-insensitively', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();
      mockCache.getLookup
        .mockResolvedValueOnce({ value: null, isStale: false })  // sprint cache miss
        .mockResolvedValueOnce({ value: null, isStale: false }); // board hint miss
      const sprintsWithLowerCase = {
        values: [{ id: 13772, name: 'Sprint 1', state: 'active', originBoardId: 2 }],
        isLast: true,
      };
      (mockClient.get as jest.Mock)
        .mockResolvedValueOnce(MOCK_BOARDS)
        .mockResolvedValueOnce(sprintsWithLowerCase); // board 2 first (id-desc, no hint)

      const result = await convertSprintType('sprint 1', sprintFieldSchema, context);
      expect(result).toBe(13772);
    });

    it('should throw ValidationError with available sprints when name not found', async () => {
      const { context, mockCache } = createContextWithClient();

      // Use cache directly to avoid double-API-call issue
      // (each .rejects check triggers a full fetch since cache is exhausted after first call)
      const cachedSprints = [
        { id: 13772, name: 'Sprint 1', state: 'active' },
        { id: 13773, name: 'Sprint 2', state: 'future' },
      ];
      mockCache.getLookup.mockResolvedValue({ value: cachedSprints, isStale: false });

      await expect(convertSprintType('Nonexistent Sprint', sprintFieldSchema, context))
        .rejects.toThrow(ValidationError);
      await expect(convertSprintType('Nonexistent Sprint', sprintFieldSchema, context))
        .rejects.toThrow(/Sprint 1/); // should list available sprints
    });

    it('should throw ValidationError with helpful hint when no boards/sprints found', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false });
      (mockClient.get as jest.Mock).mockResolvedValue({ values: [], isLast: true });

      await expect(convertSprintType('Sprint 1', sprintFieldSchema, context))
        .rejects.toThrow(ValidationError);
      await expect(convertSprintType('Sprint 1', sprintFieldSchema, context))
        .rejects.toThrow(/no sprints available|sprint id/i);
    });
  });

  describe('AC6: Sprint name lookup — cache hit (no API call)', () => {
    it('should use cached sprints without calling API', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();

      const cachedSprints = [
        { id: 13772, name: 'Sprint 1', state: 'active' },
        { id: 13773, name: 'Sprint 2', state: 'future' },
      ];
      mockCache.getLookup.mockResolvedValue({ value: cachedSprints, isStale: false });

      const result = await convertSprintType('Sprint 2', sprintFieldSchema, context);
      expect(result).toBe(13773);
      expect(mockClient.get).not.toHaveBeenCalled();
    });
  });

  describe('AC7: Sprint name lookup — stale cache (SWR)', () => {
    it('should return from stale cache immediately and trigger background refresh', async () => {
      const mockClient = createMockClient();
      const mockCache = {
        ...createMockCache(),
        refreshOnce: jest.fn().mockResolvedValue(undefined),
      };

      const cachedSprints = [{ id: 13772, name: 'Sprint 1', state: 'active' }];
      mockCache.getLookup.mockResolvedValue({ value: cachedSprints, isStale: true });

      const context = createMockContext({
        cache: mockCache as any,
        client: mockClient as JiraClient,
      });

      const result = await convertSprintType('Sprint 1', sprintFieldSchema, context);
      expect(result).toBe(13772);

      // Should fire background refresh
      expect(mockCache.refreshOnce).toHaveBeenCalledWith(
        expect.stringContaining('sprint:TEST'),
        expect.any(Function)
      );
      // Should NOT make a synchronous API call
      expect(mockClient.get).not.toHaveBeenCalled();
    });
  });

  describe('AC8: Multiple sprints with same name', () => {
    it('should prefer active sprint when name matches multiple', async () => {
      const { context, mockCache } = createContextWithClient();

      const sprints = [
        { id: 13772, name: 'Sprint Alpha', state: 'closed' },
        { id: 13773, name: 'Sprint Alpha', state: 'active' },
        { id: 13774, name: 'Sprint Alpha', state: 'future' },
      ];
      mockCache.getLookup.mockResolvedValue({ value: sprints, isStale: false });

      const result = await convertSprintType('Sprint Alpha', sprintFieldSchema, context);
      expect(result).toBe(13773); // active one
    });

    it('should prefer future sprint when no active sprint matches', async () => {
      const { context, mockCache } = createContextWithClient();

      const sprints = [
        { id: 13772, name: 'Sprint Alpha', state: 'closed' },
        { id: 13774, name: 'Sprint Alpha', state: 'future' },
      ];
      mockCache.getLookup.mockResolvedValue({ value: sprints, isStale: false });

      const result = await convertSprintType('Sprint Alpha', sprintFieldSchema, context);
      expect(result).toBe(13774); // future one
    });
  });

  describe('AC9: Invalid input types', () => {
    it('should throw ValidationError for boolean input', async () => {
      const { context } = createContextWithClient();
      await expect(convertSprintType(true, sprintFieldSchema, context))
        .rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for plain object without id', async () => {
      const { context } = createContextWithClient();
      // Object without id property falls through to name lookup on toString
      // which should fail since "{}" is not a valid sprint name or numeric string
      await expect(convertSprintType({}, sprintFieldSchema, context))
        .rejects.toThrow();
    });
  });

  describe('AC10: No client available for name lookup', () => {
    it('should throw ValidationError when no client and name given', async () => {
      const mockCache = createMockCache();
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false });

      const context = createMockContext({
        cache: mockCache as any,
        client: undefined,
      });

      await expect(convertSprintType('Sprint 1', sprintFieldSchema, context))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('AC11: Paginated API responses', () => {
    it('should fetch all pages of boards', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();
      // All getLookup calls return miss (sprint cache + board hint)
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false });

      // Two pages of boards (both have id=1/2 → sorted desc: 2 then 1)
      // Sprint 3 is on board 2 → found on first sprint fetch
      (mockClient.get as jest.Mock)
        .mockResolvedValueOnce({ values: [{ id: 1, name: 'Board 1' }], isLast: false }) // boards page 1
        .mockResolvedValueOnce({ values: [{ id: 2, name: 'Board 2' }], isLast: true })  // boards page 2
        .mockResolvedValueOnce(MOCK_SPRINTS_BOARD_2);  // board 2 (id=2, checked first)

      const result = await convertSprintType('Sprint 3', sprintFieldSchema, context);
      expect(result).toBe(13774); // from board 2
    });
  });

  describe('AC12: Board type filtering and graceful skip', () => {
    it('should request only scrum boards (type=scrum in board API call)', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false });

      (mockClient.get as jest.Mock)
        .mockResolvedValueOnce(MOCK_BOARDS)
        .mockResolvedValueOnce(MOCK_SPRINTS_BOARD_2)   // board 2 first (id-desc)
        .mockResolvedValueOnce(MOCK_SPRINTS_BOARD_1);  // board 1 second

      await convertSprintType('Sprint 1', sprintFieldSchema, context);

      expect(mockClient.get).toHaveBeenCalledWith(
        '/rest/agile/1.0/board',
        expect.objectContaining({ projectKeyOrId: 'TEST', type: 'scrum' })
      );
    });

    it('should skip a board that returns 400 "does not support sprints" and continue to next', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false });

      const unsupportedError = new ValidationError('The board does not support sprints', { status: 400 });

      // No hint → boards sorted id-desc: board 2 (id=2) first, board 1 (id=1) second
      (mockClient.get as jest.Mock)
        .mockResolvedValueOnce(MOCK_BOARDS)           // boards
        .mockRejectedValueOnce(unsupportedError)      // board 2 sprint fetch → 400
        .mockResolvedValueOnce(MOCK_SPRINTS_BOARD_2); // board 1 sprint fetch (has Sprint 3)

      // Sprint 3 lives in MOCK_SPRINTS_BOARD_2 — found despite one board failing
      const result = await convertSprintType('Sprint 3', sprintFieldSchema, context);
      expect(result).toBe(13774);
    });

    it('should NOT swallow unexpected non-400 errors from sprint endpoint', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false });

      const serverError = new Error('Network error');

      (mockClient.get as jest.Mock)
        .mockResolvedValueOnce(MOCK_BOARDS)
        .mockRejectedValueOnce(serverError); // unexpected error on first board

      await expect(convertSprintType('Sprint 1', sprintFieldSchema, context))
        .rejects.toThrow('Network error');
    });
  });

  describe('AC13: MRU board hint', () => {
    it('should store board hint after successful name lookup', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false });

      const sprintsWithOriginBoard = {
        values: [{ id: 13772, name: 'Sprint 1', state: 'active', originBoardId: 99 }],
        isLast: true,
      };
      (mockClient.get as jest.Mock)
        .mockResolvedValueOnce(MOCK_BOARDS)
        .mockResolvedValueOnce(sprintsWithOriginBoard);

      await convertSprintType('Sprint 1', sprintFieldSchema, context);

      // Should call getLookup for the existing hint (to prepend) then setLookup with [99]
      expect(mockCache.setLookup).toHaveBeenCalledWith(
        'TEST', 'sprint-boards', expect.arrayContaining([99]), undefined
      );
    });

    it('should place hinted board first when cache is cold', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();

      // Sprint cache miss, board hint says board 1 (id=1) is MRU
      mockCache.getLookup
        .mockResolvedValueOnce({ value: null, isStale: false })    // sprint cache miss
        .mockResolvedValueOnce({ value: [1], isStale: false });     // hint: board 1 is MRU

      // Board 1 is hinted → comes first despite having lower id
      (mockClient.get as jest.Mock)
        .mockResolvedValueOnce(MOCK_BOARDS)          // boards (id 1 and 2)
        .mockResolvedValueOnce(MOCK_SPRINTS_BOARD_1); // board 1 checked first (MRU hint)

      const result = await convertSprintType('Sprint 1', sprintFieldSchema, context);
      expect(result).toBe(13772);

      // Verify board 1 was the first sprint endpoint called
      const getCalls = (mockClient.get as jest.Mock).mock.calls;
      const firstSprintCall = getCalls.find(([url]) =>
        typeof url === 'string' && url.includes('/sprint')
      );
      expect(firstSprintCall?.[0]).toContain('/board/1/sprint');
    });

    it('should not crash when sprint has no originBoardId', async () => {
      const { context, mockClient, mockCache } = createContextWithClient();
      mockCache.getLookup.mockResolvedValue({ value: null, isStale: false });

      const sprintsNoOrigin = {
        values: [{ id: 13772, name: 'Sprint 1', state: 'active' }], // no originBoardId
        isLast: true,
      };
      (mockClient.get as jest.Mock)
        .mockResolvedValueOnce(MOCK_BOARDS)
        .mockResolvedValueOnce(sprintsNoOrigin);

      // Should still resolve without error; hint just won't be written
      const result = await convertSprintType('Sprint 1', sprintFieldSchema, context);
      expect(result).toBe(13772);
    });
  });
});
