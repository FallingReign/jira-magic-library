/**
 * Unit tests for DeploymentDetector
 * Tests Cloud vs Server detection from serverInfo response.
 */

import { DeploymentDetector } from '../../../src/client/DeploymentDetector.js';
import type { JiraClient } from '../../../src/client/JiraClient.js';

describe('DeploymentDetector', () => {
  let mockClient: jest.Mocked<JiraClient>;
  let detector: DeploymentDetector;

  beforeEach(() => {
    mockClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };
    detector = new DeploymentDetector(mockClient);
  });

  it('should detect Cloud deployment when deploymentType is "Cloud"', async () => {
    mockClient.get.mockResolvedValueOnce({
      version: '1001.0.0',
      versionNumbers: [1001, 0, 0],
      deploymentType: 'Cloud',
      buildNumber: 100234,
    });

    const result = await detector.detect();

    expect(result).toEqual({
      deployment: 'cloud',
      version: '1001.0.0',
      buildNumber: 100234,
    });
    expect(mockClient.get).toHaveBeenCalledWith('/rest/api/2/serverInfo');
  });

  it('should detect Server deployment when deploymentType is "Server"', async () => {
    mockClient.get.mockResolvedValueOnce({
      version: '9.4.0',
      versionNumbers: [9, 4, 0],
      deploymentType: 'Server',
      buildNumber: 90400,
    });

    const result = await detector.detect();

    expect(result).toEqual({
      deployment: 'server',
      version: '9.4.0',
      buildNumber: 90400,
    });
  });

  it('should detect Server deployment when deploymentType is missing', async () => {
    mockClient.get.mockResolvedValueOnce({
      version: '8.20.0',
      versionNumbers: [8, 20, 0],
      buildNumber: 82000,
    });

    const result = await detector.detect();

    expect(result).toEqual({
      deployment: 'server',
      version: '8.20.0',
      buildNumber: 82000,
    });
  });

  it('should cache result after first detection', async () => {
    mockClient.get.mockResolvedValueOnce({
      version: '9.4.0',
      versionNumbers: [9, 4, 0],
      deploymentType: 'Server',
      buildNumber: 90400,
    });

    const first = await detector.detect();
    const second = await detector.detect();

    expect(first).toEqual(second);
    expect(mockClient.get).toHaveBeenCalledTimes(1);
  });

  it('should re-detect after reset()', async () => {
    mockClient.get
      .mockResolvedValueOnce({
        version: '9.4.0',
        versionNumbers: [9, 4, 0],
        deploymentType: 'Server',
        buildNumber: 90400,
      })
      .mockResolvedValueOnce({
        version: '1001.0.0',
        versionNumbers: [1001, 0, 0],
        deploymentType: 'Cloud',
        buildNumber: 100234,
      });

    const first = await detector.detect();
    expect(first.deployment).toBe('server');

    detector.reset();

    const second = await detector.detect();
    expect(second.deployment).toBe('cloud');
    expect(mockClient.get).toHaveBeenCalledTimes(2);
  });
});
