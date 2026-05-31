/**
 * Unit tests for EndpointResolver
 * Tests all endpoint paths for both Cloud and Server deployments.
 */

import { EndpointResolver } from '../../../src/client/EndpointResolver.js';

describe('EndpointResolver', () => {
  describe('Server (v2)', () => {
    const resolver = new EndpointResolver('server', 'v2');

    it('should have correct apiBase', () => {
      expect(resolver.apiBase).toBe('/rest/api/2');
    });

    it('should resolve serverInfo', () => {
      expect(resolver.serverInfo()).toBe('/rest/api/2/serverInfo');
    });

    it('should resolve createMeta', () => {
      expect(resolver.createMeta('PROJ')).toBe(
        '/rest/api/2/issue/createmeta?projectKeys=PROJ&expand=projects.issuetypes.fields'
      );
    });

    it('should resolve createMetaFields', () => {
      expect(resolver.createMetaFields('PROJ', '10001')).toBe(
        '/rest/api/2/issue/createmeta/PROJ/issuetypes/10001'
      );
    });

    it('should resolve issueCreate', () => {
      expect(resolver.issueCreate()).toBe('/rest/api/2/issue');
    });

    it('should resolve issueBulkCreate', () => {
      expect(resolver.issueBulkCreate()).toBe('/rest/api/2/issue/bulk');
    });

    it('should resolve issueGet', () => {
      expect(resolver.issueGet('PROJ-123')).toBe('/rest/api/2/issue/PROJ-123');
    });

    it('should resolve issueUpdate', () => {
      expect(resolver.issueUpdate('PROJ-456')).toBe('/rest/api/2/issue/PROJ-456');
    });

    it('should resolve search', () => {
      expect(resolver.search()).toBe('/rest/api/2/search');
    });

    it('should resolve userSearch for Server', () => {
      expect(resolver.userSearch()).toBe('/rest/api/2/user/search');
      expect(resolver.userSearchParam).toBe('username');
    });

    it('should resolve projectList for Server', () => {
      expect(resolver.projectList()).toBe('/rest/api/2/project');
    });

    it('should resolve projectGet', () => {
      expect(resolver.projectGet('PROJ')).toBe('/rest/api/2/project/PROJ');
    });

    it('should resolve fieldList', () => {
      expect(resolver.fieldList()).toBe('/rest/api/2/field');
    });

    it('should resolve fieldContext', () => {
      expect(resolver.fieldContext('customfield_10001')).toBe(
        '/rest/api/2/field/customfield_10001/context'
      );
    });

    it('should resolve fieldOptions', () => {
      expect(resolver.fieldOptions('customfield_10001', '10100')).toBe(
        '/rest/api/2/field/customfield_10001/context/10100/option'
      );
    });

    it('should report isServer=true, isCloud=false', () => {
      expect(resolver.isServer).toBe(true);
      expect(resolver.isCloud).toBe(false);
    });
  });

  describe('Cloud (v3)', () => {
    const resolver = new EndpointResolver('cloud', 'v3');

    it('should have correct apiBase', () => {
      expect(resolver.apiBase).toBe('/rest/api/3');
    });

    it('should resolve serverInfo (always v2)', () => {
      expect(resolver.serverInfo()).toBe('/rest/api/2/serverInfo');
    });

    it('should resolve createMeta', () => {
      expect(resolver.createMeta('CLOUD')).toBe(
        '/rest/api/3/issue/createmeta?projectKeys=CLOUD&expand=projects.issuetypes.fields'
      );
    });

    it('should resolve issueCreate', () => {
      expect(resolver.issueCreate()).toBe('/rest/api/3/issue');
    });

    it('should resolve userSearch for Cloud', () => {
      expect(resolver.userSearch()).toBe('/rest/api/3/user/search');
      expect(resolver.userSearchParam).toBe('query');
    });

    it('should resolve projectList for Cloud (paginated)', () => {
      expect(resolver.projectList()).toBe('/rest/api/3/project/search');
    });

    it('should resolve projectGet', () => {
      expect(resolver.projectGet('CLOUD')).toBe('/rest/api/3/project/CLOUD');
    });

    it('should resolve fieldList', () => {
      expect(resolver.fieldList()).toBe('/rest/api/3/field');
    });

    it('should report isServer=false, isCloud=true', () => {
      expect(resolver.isServer).toBe(false);
      expect(resolver.isCloud).toBe(true);
    });
  });

  describe('Cloud with v2 override', () => {
    const resolver = new EndpointResolver('cloud', 'v2');

    it('should use v2 paths even for cloud', () => {
      expect(resolver.apiBase).toBe('/rest/api/2');
      expect(resolver.issueCreate()).toBe('/rest/api/2/issue');
    });

    it('should still use Cloud-specific endpoint logic', () => {
      expect(resolver.projectList()).toBe('/rest/api/2/project/search');
      expect(resolver.userSearchParam).toBe('query');
    });
  });
});
