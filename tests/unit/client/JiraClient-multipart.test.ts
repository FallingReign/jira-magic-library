import { JiraClientImpl } from '../../../src/client/JiraClient.js';
import type { JMLConfig } from '../../../src/types/config.js';

global.fetch = jest.fn();

describe('JiraClient multipart requests', () => {
  let client: JiraClientImpl;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const config: JMLConfig = {
    baseUrl: 'https://test.atlassian.net',
    auth: { token: 'test-token' },
  };

  beforeEach(() => {
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockReset();
    client = new JiraClientImpl(config);
  });

  it('sends FormData without a manual content type and includes Jira upload headers', async () => {
    const form = new FormData();
    form.append('file', new Blob(['content']), 'notes.txt');
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: '10001', filename: 'notes.txt' }],
    } as Response);

    const result = await client.postMultipart('/rest/api/3/issue/TEST-1/attachments', form);

    expect(result).toEqual([{ id: '10001', filename: 'notes.txt' }]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://test.atlassian.net/rest/api/3/issue/TEST-1/attachments'
    );
    const request = mockFetch.mock.calls[0]?.[1];
    expect(request?.method).toBe('POST');
    expect(request?.body).toBe(form);
    expect(request?.headers).toHaveProperty('Authorization');
    expect(request?.headers).toHaveProperty('Accept', 'application/json');
    expect(request?.headers).toHaveProperty('X-Atlassian-Token', 'no-check');
    expect(request?.headers).not.toHaveProperty('Content-Type');
  });
});
