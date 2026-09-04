import { JiraClientImpl } from '../../../src/client/JiraClient.js';

const response = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, statusText: 'Response', json: async () => body, text: async () => JSON.stringify(body) }) as Response;
describe('HTTP response boundaries', () => {
  afterEach(() => { jest.useRealTimers(); });
  it.each([[429, 'Rate limit exceeded'], [503, 'Service temporarily unavailable']])('reports HTTP %s without an error message after bounded retries', async (status, message) => {
    jest.useFakeTimers();
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(response(Number(status), {}));
    const client = new JiraClientImpl({ baseUrl: 'https://jira.test', auth: { token: 'test' } });
    const result = expect(client.get('/test')).rejects.toThrow(String(message));
    await jest.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('refreshes OAuth credentials after a 401 and retries with the new access token', async () => {
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response(401, {})).mockResolvedValueOnce(response(200, { access_token: 'new-token' })).mockResolvedValueOnce(response(200, { key: 'TEST-1' }));
    const client = new JiraClientImpl({ baseUrl: 'https://jira.test', auth: { type: 'oauth2', accessToken: 'old-token', refreshToken: 'refresh', clientId: 'id', clientSecret: 'secret' } });
    expect(await client.get('/issue')).toEqual({ key: 'TEST-1' });
    expect(fetch.mock.calls[2][1]?.headers).toMatchObject({ Authorization: 'Bearer new-token' });
  });
  it('reports a payload size rejection', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(413, {}));
    const client = new JiraClientImpl({ baseUrl: 'https://jira.test', auth: { token: 'test' } });
    await expect(client.post('/issue', {})).rejects.toThrow('Payload too large');
  });
});
