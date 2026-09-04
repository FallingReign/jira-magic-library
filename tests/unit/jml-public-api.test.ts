import * as api from '../../src/index.js';
import { JiraClientImpl } from '../../src/client/JiraClient.js';

jest.mock('../../src/client/JiraClient.js');
jest.mock('../../src/cache/RedisCache.js', () => ({ RedisCache: jest.fn().mockImplementation(() => new (jest.requireActual('../../src/cache/InMemoryCache.js').InMemoryCache)()) }));

const project = { id: '1', key: 'TEST', name: 'Testing', projectTypeKey: 'software' };
const option = { id: '7', value: 'Red' };
const fields = [{ fieldId: 'customfield_1', id: 'customfield_1', key: 'customfield_1', name: 'Colour', required: false, custom: true, schema: { type: 'option' }, allowedValues: [option] }];

describe('public library API', () => {
  it('exports callable entry points for the documented feature families', () => {
    const names = ['JML', 'loadConfig', 'parseInput', 'preprocessQuotes', 'preprocessQuotesWithDetails', 'preprocessCustomBlocks',
      'PayloadPreview', 'CacheInvalidation', 'ErrorNormalizer', 'AdfConverter', 'IssueSearch', 'AttachmentUploader',
      'JPOHierarchyDiscovery', 'getParentLevel', 'isValidParent', 'ParentFieldDiscovery', 'ManifestStorage', 'JiraBulkApiWrapper',
      'ValidationService', 'RedisCache', 'JiraClientImpl', 'createAuthStrategy', 'PatAuthStrategy', 'BasicAuthStrategy',
      'OAuth2AuthStrategy', 'OAuthTokenManager', 'isLegacyAuth', 'DeploymentDetector', 'EndpointResolver', 'InMemoryCache',
      'migrateConfig', 'ProjectDiscovery', 'IssueTypeDiscovery', 'FieldMetadataDiscovery', 'UserResolver', 'FieldOptionResolver', 'EntityResolver',
      'JMLError', 'ValidationError', 'AmbiguityError', 'JIRAApiError', 'ConnectionError', 'AuthenticationError', 'SchemaError',
      'CacheError', 'ConversionError', 'AttachmentUploadError'];
    for (const name of names) expect(typeof (api as Record<string, unknown>)[name]).toBe('function');
  });

  it.each(['server', 'cloud'] as const)('routes discovery and resolution through the %s API', async deployment => {
    const get = jest.fn(async (path: string) => {
      if (path.includes('serverInfo')) return { deploymentType: deployment === 'cloud' ? 'Cloud' : 'Server', version: '9.0', buildNumber: 1 };
      if (path.includes('/statuses')) return [{ name: 'Task', statuses: [{ id: '2', name: 'Open' }] }];
      if (path.includes('/components')) return [{ id: '3', name: 'Engine' }];
      if (path.includes('/versions')) return [{ id: '4', name: 'Release' }];
      if (path.endsWith('/priority')) return [{ id: '5', name: 'High' }];
      if (path.includes('/user/search')) return [{ accountId: 'a', name: 'alice', displayName: 'Alice', emailAddress: 'alice@example.com', active: true }];
      if (path.includes('/issuetypes/')) return { values: fields };
      if (path.endsWith('/issuetypes')) return { values: [{ id: '1', name: 'Task' }] };
      if (path.includes('/createmeta')) return { projects: [{ issuetypes: [{ name: 'Task', fields: { customfield_1: { allowedValues: [option] } } }] }] };
      if (path.endsWith('/field')) return fields;
      if (path.endsWith('/project/TEST')) return project;
      if (path.endsWith('/project/search')) return { values: [project] };
      if (path.endsWith('/project')) return [project];
      throw new Error('Unexpected read: ' + path);
    });
    (JiraClientImpl as jest.MockedClass<typeof JiraClientImpl>).mockImplementation(() => ({ get, post: jest.fn() }) as any);
    const jml = new api.JML({ baseUrl: 'https://jira.test', auth: { token: 'test' }, deployment });
    expect(await jml.projects.list()).toMatchObject([project]);
    expect(await jml.projects.search('Testing')).toHaveLength(1);
    expect(await jml.projects.get('TEST')).toMatchObject(project);
    expect(await jml.fields.list()).toHaveLength(1);
    expect(await jml.fields.getForContext('TEST', 'Task')).toHaveLength(1);
    expect(await jml.fields.get('Colour', 'TEST', 'Task')).toMatchObject({ id: 'customfield_1' });
    expect(await jml.fields.getCustomFields({ query: 'Colour' })).toHaveLength(1);
    expect(await jml.issueTypes.getForProject('TEST')).toMatchObject([{ id: '1', name: 'Task' }]);
    expect(await jml.issueTypes.resolve('TEST', 'Task')).toMatchObject({ id: '1' });
    expect(await jml.users.resolve('alice@example.com')).toMatchObject({ name: 'alice' });
    expect(await jml.users.search('Alice')).toHaveLength(1);
    expect(await jml.resolve.user('alice@example.com')).toMatchObject({ accountId: 'a' });
    expect(await jml.resolve.priority('High')).toMatchObject({ id: '5' });
    expect(await jml.resolve.status('Open', 'TEST', 'Task')).toMatchObject({ id: '2' });
    expect(await jml.resolve.component('Engine', 'TEST')).toMatchObject({ id: '3' });
    expect(await jml.resolve.version('Release', 'TEST')).toMatchObject({ id: '4' });
    expect(await jml.resolve.fieldOption('customfield_1', 'Red', 'TEST', 'Task')).toMatchObject({ id: '7' });
    await jml.invalidateCache();
    await jml.invalidateCache({ fields: true });
    await jml.disconnect();
  });

  it.each(['Cloud', 'Server'])('deduplicates automatic %s detection and selects its API version', async deploymentType => {
    const get = jest.fn().mockResolvedValue({ deploymentType, version: '9.0', buildNumber: 1 });
    (JiraClientImpl as jest.MockedClass<typeof JiraClientImpl>).mockImplementation(() => ({ get }) as any);
    const jml = new api.JML({ baseUrl: 'https://jira.test', auth: { token: 'test' } });
    const [first, second] = await Promise.all([jml.getEndpointResolver(), jml.getEndpointResolver()]);
    expect(first).toBe(second);
    expect(first.apiBase).toBe(deploymentType === 'Cloud' ? '/rest/api/3' : '/rest/api/2');
    expect(get).toHaveBeenCalledTimes(1);
    await jml.disconnect();
  });
});
