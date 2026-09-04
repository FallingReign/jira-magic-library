import { convertUserType } from '../../../src/converters/types/UserConverter.js';

const field = { id: 'assignee', name: 'Assignee', type: 'user', required: false, schema: { type: 'user' } };
const user = { displayName: 'Jane Smith', emailAddress: 'jane@example.com', active: true };

function context(users: unknown[], policy: 'error' | 'score' = 'error') {
  return { projectKey: 'TEST', issueType: 'Task', client: { get: jest.fn().mockResolvedValue(users) },
    config: { ambiguityPolicy: { user: policy } } } as any;
}

describe('existing user lookup behavior', () => {
  it('supports Cloud users without Server usernames when diagnostics are enabled', async () => {
    const originalDebug = process.env.DEBUG;
    const log = jest.spyOn(console, 'log').mockImplementation();
    process.env.DEBUG = 'true';
    try {
      expect(await convertUserType('jane@example.com', field, context([
        { ...user, accountId: 'cloud-1' }, { ...user, accountId: 'cloud-2', emailAddress: 'other@example.com' },
      ]))).toEqual({ accountId: 'cloud-1' });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('unknown (Jane Smith)'));
      expect(log).toHaveBeenCalledWith(expect.stringContaining('no match for "jane@example.com"'));
    } finally {
      if (originalDebug === undefined) delete process.env.DEBUG;
      else process.env.DEBUG = originalDebug;
    }
  });

  it('limits ambiguity suggestions to five while retaining the total count', async () => {
    const users = Array.from({ length: 6 }, (_, i) => ({ ...user, accountId: `cloud-${i}` }));
    await expect(convertUserType('Jane', field, context(users))).rejects.toMatchObject({
      message: expect.stringContaining('... and 1 more'),
      details: { totalCandidates: 6, candidates: expect.arrayContaining([expect.objectContaining({ username: 'cloud-0' })]) },
    });
  });

  it.each(['error', 'score'] as const)('keeps ambiguous users without identifiers visible under %s policy', async policy => {
    await expect(convertUserType('Jane', field, context([user, { ...user, accountId: 'cloud-1' }], policy)))
      .rejects.toMatchObject({ name: 'AmbiguityError', details: { candidates: expect.arrayContaining([
        expect.objectContaining({ username: 'unknown' }), expect.objectContaining({ username: 'cloud-1' }),
      ]) } });
  });

  it('orders tied suggestions by email without silently choosing a user', async () => {
    await expect(convertUserType('QQQ', field, context([
      { ...user, name: 'account', displayName: 'QQQ', emailAddress: 'z@example.com' },
      { ...user, name: 'account', displayName: 'QQQ', emailAddress: 'b@example.com' },
    ], 'score'))).rejects.toThrow('identical scores');
  });

  it('lists exact email matches ahead of username matches in ambiguity suggestions', async () => {
    await expect(convertUserType('jane@example.com', field, context([
      { ...user, name: 'jane@example.com', emailAddress: 'different@example.com' },
      { ...user, accountId: 'cloud-1' },
    ]))).rejects.toMatchObject({ details: { candidates: [
      expect.objectContaining({ username: 'cloud-1', matchType: 'email-exact' }),
      expect.objectContaining({ username: 'jane@example.com', matchType: 'username-exact' }),
    ] } });
  });
});
