import { convertUserType, __userConverterInternals } from '../../../../src/converters/types/UserConverter.js';
import { ValidationError, AmbiguityError } from '../../../../src/errors.js';
import type { FieldSchema, ConversionContext } from '../../../../src/types/converter.js';
import type { JiraClient } from '../../../../src/client/JiraClient.js';
import { createMockContext, createMockCache, createMockClient } from '../../../helpers/test-utils.js';
import {
  TEST_USER_EMAIL,
  TEST_USER_EMAIL_ALT,
  TEST_USER_NAME,
  TEST_USER_NAME_ALT,
  NONEXISTENT_USER,
} from '../../../helpers/test-users.js';

const { compareStrings, selectBestUserMatch } = __userConverterInternals;

describe('UserConverter', () => {
  const fieldSchema: FieldSchema = {
    id: 'assignee',
    name: 'Assignee',
    type: 'user',
    required: false,
    schema: { type: 'user', system: 'assignee' },
  };

  const mockClient = createMockClient();

  const mockCache = createMockCache();

  const createContext = (overrides?: Partial<ConversionContext>): ConversionContext =>
    createMockContext({
      cache: mockCache as any,
      client: mockClient as JiraClient,
      ...overrides,
    });

  const context: ConversionContext = createContext();

  const contextWithPolicy = (
    policy: 'first' | 'error' | 'score',
    overrides?: Partial<ConversionContext>
  ): ConversionContext =>
    createContext({
      ...overrides,
      config: {
        ...(overrides?.config ?? {}),
        ambiguityPolicy: { user: policy },
      },
    });

  const emailPrimary = TEST_USER_EMAIL;
  const emailSecondary = TEST_USER_EMAIL_ALT;
  const displayPrimary = TEST_USER_NAME;
  const displaySecondary = TEST_USER_NAME_ALT;
  const nonexistentEmail = NONEXISTENT_USER;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AC1: Type-Based Registration', () => {
    it('should work for field type "user"', () => {
      expect(fieldSchema.type).toBe('user');
    });
  });

  describe('AC2: Email Address Lookup', () => {
    it('should query JIRA API with email address', async () => {
      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailPrimary, fieldSchema, context);

      expect(mockClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/rest/api/2/user/search'),
        { username: emailPrimary }
      );
      expect(result).toEqual({ name: 'alex' });
    });

    it('should match user by email (case-insensitive)', async () => {
      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailPrimary.toUpperCase(), fieldSchema, context);

      expect(result).toEqual({ name: 'alex' });
    });

    it('should return Cloud format { accountId } when user has accountId', async () => {
      const mockUsers = [
        {
          accountId: '5d8c1234567890abcdef',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailPrimary, fieldSchema, context);

      expect(result).toEqual({ accountId: '5d8c1234567890abcdef' });
    });
  });

  describe('AC3: Display Name Lookup', () => {
    it('should query JIRA API with display name', async () => {
      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(displayPrimary, fieldSchema, context);

      expect(mockClient.get).toHaveBeenCalled();
      expect(result).toEqual({ name: 'alex' });
    });

    it('should match user by display name (case-insensitive)', async () => {
      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(displayPrimary.toLowerCase(), fieldSchema, context);

      expect(result).toEqual({ name: 'alex' });
    });

    it('should return Cloud format for display name lookup', async () => {
      const mockUsers = [
        {
          accountId: '5d8c1234567890abcdef',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(displayPrimary, fieldSchema, context);

      expect(result).toEqual({ accountId: '5d8c1234567890abcdef' });
    });
  });

  describe('AC4: Object Input Handling', () => {
    it('should resolve { name: "alex" } through API (not passthrough)', async () => {
      // { name: "..." } extracts the name and resolves like a string
      // This ensures active user check, ambiguity policy, and validation run
      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const input = { name: 'alex' };
      const result = await convertUserType(input, fieldSchema, context);

      expect(result).toEqual({ name: 'alex' });
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/rest/api/2/user/search'),
        { username: 'alex' }
      );
    });

    it('should pass through Cloud format { accountId: "..." }', async () => {
      // accountId is JIRA's internal ID - safe to passthrough
      const input = { accountId: '5d8c1234567890abcdef' };
      const result = await convertUserType(input, fieldSchema, context);

      expect(result).toEqual({ accountId: '5d8c1234567890abcdef' });
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should pass through object with accountId even if name also present', async () => {
      // If accountId is present, we trust it and passthrough
      const input = { name: 'alex', accountId: '5d8c1234567890abcdef' };
      const result = await convertUserType(input, fieldSchema, context);

      expect(result).toEqual(input);
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should apply ambiguity policy when resolving { name: "..." }', async () => {
      // Multiple users match - should use ambiguity policy
      const mockUsers = [
        {
          name: 'alex.smith',
          displayName: 'Alex Smith',
          emailAddress: 'alex.smith@example.com',
          active: true,
        },
        {
          name: 'alex.jones',
          displayName: 'Alex Jones',
          emailAddress: 'alex.jones@example.com',
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const input = { name: 'alex' };
      
      // With 'error' policy, should throw AmbiguityError
      await expect(
        convertUserType(input, fieldSchema, contextWithPolicy('error'))
      ).rejects.toThrow(AmbiguityError);
    });

    it('should filter inactive users when resolving { name: "..." }', async () => {
      const mockUsers = [
        {
          name: 'alex.inactive',
          displayName: 'Alex Inactive',
          emailAddress: 'alex.inactive@example.com',
          active: false, // Inactive user
        },
        {
          name: 'alex.active',
          displayName: 'Alex Active',
          emailAddress: 'alex.active@example.com',
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const input = { name: 'alex' };
      const result = await convertUserType(input, fieldSchema, context);

      // Should only match the active user
      expect(result).toEqual({ name: 'alex.active' });
    });

    it('should throw ValidationError when { name: "..." } user not found', async () => {
      (mockClient.get as jest.Mock).mockResolvedValue([]);

      const input = { name: 'nonexistent.user' };
      
      await expect(
        convertUserType(input, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle special characters in { name: "..." } like service accounts', async () => {
      // Service accounts often have special prefixes like +Help_OnCall
      const mockUsers = [
        {
          name: '+Help_OnCall',
          displayName: 'Help OnCall Service Account',
          emailAddress: 'help-oncall@example.com',
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const input = { name: '+Help_OnCall' };
      const result = await convertUserType(input, fieldSchema, context);

      expect(result).toEqual({ name: '+Help_OnCall' });
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/rest/api/2/user/search'),
        { username: '+Help_OnCall' }
      );
    });

    it('should handle empty name in object gracefully', async () => {
      const input = { name: '' };
      
      await expect(
        convertUserType(input, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle whitespace-only name in object', async () => {
      const input = { name: '   ' };
      
      await expect(
        convertUserType(input, fieldSchema, context)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('AC5: Server vs Cloud Handling', () => {
    it('should return { name } for Server API response', async () => {
      const mockUsers = [
        {
          name: 'jsmith',
          displayName: displaySecondary,
          emailAddress: emailSecondary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailSecondary, fieldSchema, context);

      expect(result).toEqual({ name: 'jsmith' });
    });

    it('should return { accountId } for Cloud API response', async () => {
      const mockUsers = [
        {
          accountId: 'abc123def456',
          displayName: displaySecondary,
          emailAddress: emailSecondary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailSecondary, fieldSchema, context);

      expect(result).toEqual({ accountId: 'abc123def456' });
    });

    it('should prefer accountId over name if both present', async () => {
      const mockUsers = [
        {
          name: 'jsmith',
          accountId: 'abc123def456',
          displayName: displaySecondary,
          emailAddress: emailSecondary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailSecondary, fieldSchema, context);

      // Cloud format takes precedence
      expect(result).toEqual({ accountId: 'abc123def456' });
    });
  });

  describe('AC6: Ambiguity Detection', () => {
    it('should throw AmbiguityError if multiple users match display name', async () => {
      const strictContext = contextWithPolicy('error');
      const mockUsers = [
        {
          name: 'jsmith',
          displayName: displaySecondary,
          emailAddress: 'john.smith@example.com',
          active: true,
        },
        {
          name: 'jsmith2',
          displayName: displaySecondary,
          emailAddress: 'john.smith@company.com',
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      await expect(
        convertUserType(displaySecondary, fieldSchema, strictContext)
      ).rejects.toThrow(AmbiguityError);
    });

    it('should include email addresses in ambiguity error', async () => {
      const strictContext = contextWithPolicy('error');
      const mockUsers = [
        {
          name: 'jsmith',
          displayName: displaySecondary,
          emailAddress: 'john.smith@example.com',
          active: true,
        },
        {
          name: 'jsmith2',
          displayName: displaySecondary,
          emailAddress: 'john.smith@company.com',
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      await expect(
        convertUserType(displaySecondary, fieldSchema, strictContext)
      ).rejects.toThrow(/john\.smith@example\.com/);

      await expect(
        convertUserType(displaySecondary, fieldSchema, strictContext)
      ).rejects.toThrow(/john\.smith@company\.com/);
    });

    it('should NOT be ambiguous if email matches exactly one user', async () => {
      const mockUsers = [
        {
          name: 'jsmith',
          displayName: displaySecondary,
          emailAddress: 'john.smith@example.com',
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType('john.smith@example.com', fieldSchema, context);

      expect(result).toEqual({ name: 'jsmith' });
    });

    it('should suggest using email in ambiguity error message', async () => {
      const strictContext = contextWithPolicy('error');
      const mockUsers = [
        {
          name: 'jsmith',
          displayName: displaySecondary,
          emailAddress: 'john.smith@example.com',
          active: true,
        },
        {
          name: 'jsmith2',
          displayName: displaySecondary,
          emailAddress: 'john.smith@company.com',
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      await expect(
        convertUserType(displaySecondary, fieldSchema, strictContext)
      ).rejects.toThrow(/email address/i);
    });
  });

  describe('User ambiguity policy options', () => {
    it('should default to first match when duplicates exist', async () => {
      const mockUsers = [
        {
          name: 'primary-user',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
        {
          name: 'secondary-user',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailPrimary, fieldSchema, context);

      expect(result).toEqual({ name: 'primary-user' });
    });

    it('should throw AmbiguityError when policy=error', async () => {
      const strictContext = contextWithPolicy('error');
      const mockUsers = [
        {
          name: 'primary-user',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
        {
          name: 'secondary-user',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      await expect(
        convertUserType(emailPrimary, fieldSchema, strictContext)
      ).rejects.toThrow(AmbiguityError);
    });

    it('should pick highest-confidence candidate when policy=score', async () => {
      const scoreContext = contextWithPolicy('score');
      const mockUsers = [
        {
          name: emailPrimary.toLowerCase(),
          displayName: 'Tool Account',
          emailAddress: 'tool-service@example.com',
          active: true,
        },
        {
          name: 'primary-user',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailPrimary, fieldSchema, scoreContext);

      expect(result).toEqual({ name: 'primary-user' });
    });

    it('should use deterministic tie-break when score ties occur', async () => {
      const scoreContext = contextWithPolicy('score');
      const mockUsers = [
        {
          name: 'z-user',
          displayName: 'Zeta User',
          emailAddress: 'zeta@example.com',
          active: true,
        },
        {
          name: 'a-user',
          displayName: 'Alpha User',
          emailAddress: 'alpha@example.com',
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType('User', fieldSchema, scoreContext);

      expect(result).toEqual({ name: 'a-user' });
    });

    it('should not duplicate matches when email equals username', async () => {
      const mockUsers = [
        {
          name: 'dup@example.com',
          displayName: displayPrimary,
          emailAddress: 'dup@example.com',
          active: true,
        },
      ];

      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType('dup@example.com', fieldSchema, context);

      expect(result).toEqual({ name: 'dup@example.com' });
      expect(mockClient.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC7: Validation & Error Handling', () => {
    it('should throw ValidationError if user not found', async () => {
      (mockClient.get as jest.Mock).mockResolvedValue([]);

      await expect(
        convertUserType(nonexistentEmail, fieldSchema, context)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertUserType(nonexistentEmail, fieldSchema, context)
      ).rejects.toThrow(/not found/i);
    });

    it('should include search term in not found error', async () => {
      (mockClient.get as jest.Mock).mockResolvedValue([]);

      await expect(
        convertUserType(emailPrimary, fieldSchema, context)
      ).rejects.toThrow(new RegExp(emailPrimary.replace(/\./g, '\\.'), 'i'));
    });

    it('should throw ValidationError on empty string', async () => {
      await expect(
        convertUserType('', fieldSchema, context)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertUserType('', fieldSchema, context)
      ).rejects.toThrow(/empty string/i);

      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should pass through null (optional field)', async () => {
      const result = await convertUserType(null, fieldSchema, context);

      expect(result).toBeNull();
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should pass through undefined (optional field)', async () => {
      const result = await convertUserType(undefined, fieldSchema, context);

      expect(result).toBeUndefined();
      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should throw ValidationError on invalid type', async () => {
      await expect(
        convertUserType(12345 as any, fieldSchema, context)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertUserType(12345 as any, fieldSchema, context)
      ).rejects.toThrow(/Expected string or object/);
    });

    it('should throw ValidationError on invalid email format (has @ but invalid)', async () => {
      await expect(
        convertUserType('not@email', fieldSchema, context)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertUserType('not@email', fieldSchema, context)
      ).rejects.toThrow(/invalid email/i);

      expect(mockClient.get).not.toHaveBeenCalled();
    });

    it('should accept valid email formats', async () => {
      // Mock API to return matching user for any email search
      (mockClient.get as jest.Mock).mockImplementation((url, options) => {
        const email = options.username;
        return Promise.resolve([{
          name: 'test',
          displayName: 'Test User',
          emailAddress: email,
          active: true,
        }]);
      });

      // These should NOT throw - all valid email formats
      await expect(convertUserType('test@example.com', fieldSchema, context)).resolves.toBeDefined();
      await expect(convertUserType('test.user@example.com', fieldSchema, context)).resolves.toBeDefined();
      await expect(convertUserType('test+tag@example.co.uk', fieldSchema, context)).resolves.toBeDefined();
      await expect(convertUserType('test_user@sub.example.com', fieldSchema, context)).resolves.toBeDefined();
    });
  });

  describe('AC8: Caching (Optional)', () => {
    it('should check cache for user lookup', async () => {
      const cachedUser = { name: 'cached', displayName: 'Cached User', emailAddress: 'cached@example.com' };
      mockCache.getLookup.mockResolvedValue([cachedUser]);

      const result = await convertUserType('cached@example.com', fieldSchema, context);

      expect(mockCache.getLookup).toHaveBeenCalledWith('TEST', 'user', 'Bug');
      expect(result).toEqual({ name: 'cached' });
      expect(mockClient.get).not.toHaveBeenCalled(); // Cache hit, no API call
    });

    it('should cache user after API lookup', async () => {
      mockCache.getLookup.mockResolvedValue(null); // Cache miss

      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      await convertUserType(emailPrimary, fieldSchema, context);

      expect(mockCache.setLookup).toHaveBeenCalledWith(
        'TEST',
        'user',
        mockUsers,
        'Bug'
      );
    });

    it('should work without cache (graceful degradation)', async () => {
      const contextWithoutCache: ConversionContext = {
        ...context,
        cache: undefined,
      };

      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailPrimary, fieldSchema, contextWithoutCache);

      expect(result).toEqual({ name: 'alex' });
      expect(mockClient.get).toHaveBeenCalled();
    });

    it('should handle cache errors gracefully', async () => {
      mockCache.getLookup.mockRejectedValue(new Error('Cache error'));

      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailPrimary, fieldSchema, context);

      expect(result).toEqual({ name: 'alex' });
      expect(mockClient.get).toHaveBeenCalled(); // Falls back to API
    });
  });

  describe('Edge Cases', () => {
    it('should trim whitespace from email', async () => {
      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(`  ${emailPrimary}  `, fieldSchema, context);

      expect(result).toEqual({ name: 'alex' });
    });

    it('should trim whitespace from display name', async () => {
      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(`  ${displayPrimary}  `, fieldSchema, context);

      expect(result).toEqual({ name: 'alex' });
    });

    it('should handle API errors gracefully', async () => {
      (mockClient.get as jest.Mock).mockRejectedValue(new Error('API Error'));

      await expect(
        convertUserType(emailPrimary, fieldSchema, context)
      ).rejects.toThrow('API Error');
    });

    it('should filter out inactive users', async () => {
      const mockUsers = [
        {
          name: 'inactive',
          displayName: 'Inactive User',
          emailAddress: 'inactive@example.com',
          active: false,
        },
        {
          name: 'active',
          displayName: 'Active User',
          emailAddress: 'active@example.com',
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType('active@example.com', fieldSchema, context);

      expect(result).toEqual({ name: 'active' });
    });

    it('should throw if all users are inactive', async () => {
      const mockUsers = [
        {
          name: 'inactive',
          displayName: 'Inactive User',
          emailAddress: 'inactive@example.com',
          active: false,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      await expect(
        convertUserType('inactive@example.com', fieldSchema, context)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertUserType('inactive@example.com', fieldSchema, context)
      ).rejects.toThrow(/no active users/i);
    });

    it('should throw if user has neither name nor accountId', async () => {
      const mockUsers = [
        {
          displayName: 'Broken User',
          emailAddress: 'broken@example.com',
          active: true,
          // Missing both name and accountId!
        } as any,
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      await expect(
        convertUserType('broken@example.com', fieldSchema, context)
      ).rejects.toThrow(ValidationError);

      await expect(
        convertUserType('broken@example.com', fieldSchema, context)
      ).rejects.toThrow(/missing both name and accountId/i);
    });

    it('should return name field for Server format (no accountId)', async () => {
      const mockUsers = [
        {
          name: 'jsmith',
          displayName: displaySecondary,
          emailAddress: emailSecondary,
          active: true,
          // No accountId (JIRA Server format)
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType(emailSecondary, fieldSchema, context);

      expect(result).toEqual({ name: 'jsmith' });
      expect(result).not.toHaveProperty('accountId');
    });

    it('should match by username field when query looks like email but is username', async () => {
      // JIRA Server usernames can contain @ (e.g., user@company.com)
      const mockUsers = [
        {
          name: 'testuser@example.com',
          displayName: 'Test User',
          emailAddress: 'test.user@company.com',
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const result = await convertUserType('testuser@example.com', fieldSchema, context);

      expect(result).toEqual({ name: 'testuser@example.com' });
    });

    it('should match by exact username before falling back to display name', async () => {
      const mockUsers = [
        {
          name: 'auser',
          displayName: 'Jonathan Time',
          emailAddress: 'jonathan.time@company.com',
          active: true,
        },
        {
          name: 'jsmith',
          displayName: 'John Smith', // Contains "time" in display name
          emailAddress: 'john.smith@company.com',
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      // Should match exact username "auser", not partial display name "John Smith"
      const result = await convertUserType('auser', fieldSchema, context);

      expect(result).toEqual({ name: 'auser' });
    });

    it('should match username by prefix when exact match not found (JIRA Server email-usernames)', async () => {
      const mockUsers = [
        {
          name: 'auser@company.com',
          displayName: 'Justin Time',
          emailAddress: 'justin.time@company.com',
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      // JIRA API returns "auser@company.com" when searching "auser"
      // Should match by prefix since "auser@..." starts with "auser"
      const result = await convertUserType('auser', fieldSchema, context);

      expect(result).toEqual({ name: 'auser@company.com' });
    });

    it('should throw "No user with that username or display name" when not found', async () => {
      (mockClient.get as jest.Mock).mockResolvedValue([
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ]);

      // Search for "Bob" but only "Alex" exists
      await expect(
        convertUserType('Bob Smith', fieldSchema, context)
      ).rejects.toThrow(/no user with that username or display name/i);
    });

    it('should handle ambiguity candidate with undefined email', async () => {
      const mockUsers = [
        {
          name: 'user1',
          displayName: 'Test User',
          emailAddress: 'user1@example.com',
          active: true,
        },
        {
          name: 'user2',
          displayName: 'Test User',
          // emailAddress is undefined
          active: true,
        } as any,
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const strictContext = contextWithPolicy('error');
      await expect(
        convertUserType('Test User', fieldSchema, strictContext)
      ).rejects.toThrow(AmbiguityError);

      // Should still format candidate list properly even with undefined email
      await expect(
        convertUserType('Test User', fieldSchema, strictContext)
      ).rejects.toThrow(/user1@example.com/);
    });

    it('should handle candidate with no name, no accountId (unknown fallback)', async () => {
      const mockUsers = [
        {
          displayName: 'Test User A',
          emailAddress: 'usera@example.com',
          active: true,
        } as any,
        {
          displayName: 'Test User B',
          emailAddress: 'userb@example.com',
          active: true,
        } as any,
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      const strictContext = contextWithPolicy('error');
      await expect(
        convertUserType('Test User', fieldSchema, strictContext)
      ).rejects.toThrow(AmbiguityError);

      // Should show 'unknown' for users with no name/accountId
      await expect(
        convertUserType('Test User', fieldSchema, strictContext)
      ).rejects.toThrow(/unknown/);
    });
  });

  describe('Debug Logging', () => {
    let originalDebug: string | undefined;
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      originalDebug = process.env.DEBUG;
      process.env.DEBUG = 'true';
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      if (originalDebug === undefined) {
        delete process.env.DEBUG;
      } else {
        process.env.DEBUG = originalDebug;
      }
      consoleLogSpy.mockRestore();
    });

    it('should log debug info when user found', async () => {
      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
        {
          name: 'other',
          displayName: 'Other User',
          emailAddress: 'other@example.com',
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      await convertUserType(emailPrimary, fieldSchema, context);

      // Should log search info
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('UserConverter Debug: Searching for')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Detected as: Email')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Active users returned from API: 2')
      );

      // Should log match info
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Matched 1 user(s)')
        );

      // Should log filtered out users
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Filtered out 1 user(s)')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('other')
      );
    });

    it('should log debug info when user not found', async () => {
      const mockUsers = [
        {
          name: 'alex',
          displayName: displayPrimary,
          emailAddress: emailPrimary,
          active: true,
        },
      ];
      (mockClient.get as jest.Mock).mockResolvedValue(mockUsers);

      await expect(
        convertUserType(nonexistentEmail, fieldSchema, context)
      ).rejects.toThrow(ValidationError);

      // Should log search info
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('UserConverter Debug: Searching for')
      );

      // Should log no matches
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No matches found')
      );
    });
  });

  describe('__userConverterInternals', () => {
    describe('compareStrings', () => {
      it('should handle undefined combinations deterministically', () => {
        expect(compareStrings(undefined, undefined)).toBe(0);
        expect(compareStrings(undefined, 'alpha')).toBe(1);
        expect(compareStrings('alpha', undefined)).toBe(-1);
        expect(compareStrings('alpha', 'beta')).toBeLessThan(0);
      });
    });

    describe('selectBestUserMatch', () => {
      it('should prefer email, then name when confidences tie', () => {
        const createMatch = (overrides = {}): any =>
          ({
            user: {
              name: 'user',
              displayName: undefined,
              emailAddress: undefined,
              ...overrides,
            },
            reason: 'username-prefix',
            confidence: 0.7,
          }) as any;

        const matches = [
          createMatch({ name: 'gamma', displayName: 'Beta', emailAddress: 'c@example.com' }),
          createMatch({ name: 'alpha', displayName: 'Beta', emailAddress: 'a@example.com' }),
          createMatch({ name: 'beta', displayName: 'Beta', emailAddress: 'c@example.com' }),
          createMatch({ name: 'delta', displayName: 'Beta', emailAddress: 'c@example.com' }),
          createMatch({ name: 'epsilon', displayName: 'Beta', emailAddress: 'c@example.com' }),
        ];

        const best = selectBestUserMatch(matches as any);

        expect(best.user.name).toBe('alpha');
      });
    });
  });
});
