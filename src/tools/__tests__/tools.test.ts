import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunTestFromFileTool, RunTestInlineTool, QuickTestTool, ListCapabilitiesTool, ParseResultsTool } from '../index.js';
import { ArtilleryWrapper } from '../../lib/artillery.js';

// Mock ArtilleryWrapper
vi.mock('../../lib/artillery.js', () => ({
  ArtilleryWrapper: vi.fn()
}));

describe('MCP Tools', () => {
  let mockArtillery: any;
  let mockConfig: any;

  beforeEach(() => {
    mockArtillery = {
      runTestFromFile: vi.fn(),
      runTestInline: vi.fn(),
      quickTest: vi.fn(),
      getVersion: vi.fn(),
      parseResults: vi.fn()
    };

    mockConfig = {
      artilleryBin: '/usr/local/bin/artillery',
      workDir: '/tmp/artillery-tests',
      timeoutMs: 300000,
      maxOutputMb: 10,
      allowQuick: true
    };

    vi.clearAllMocks();
  });

  describe('RunTestFromFileTool', () => {
    it('should validate input schema', async () => {
      const tool = new RunTestFromFileTool(mockArtillery);
      
      expect(tool.name).toBe('run_test_from_file');
      expect(tool.description).toBe('Run an Artillery test from a config file path.');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should handle dry-run validation', async () => {
      const tool = new RunTestFromFileTool(mockArtillery);
      const request = {
        params: {
          arguments: {
            path: 'test.yml',
            validateOnly: true
          }
        }
      };

      const result = await tool.call(request as any);
      
      expect(result.status).toBe('ok');
      expect(result.data?.exitCode).toBe(0);
      expect(result.data?.logsTail).toContain('Configuration validated successfully');
    });

    it('should run test and return result', async () => {
      const tool = new RunTestFromFileTool(mockArtillery);
      const mockResult = {
        exitCode: 0,
        elapsedMs: 5000,
        logsTail: 'Test completed successfully',
        summary: { requestsTotal: 100, rpsAvg: 10 }
      };

      mockArtillery.runTestFromFile.mockResolvedValue(mockResult);

      const request = {
        params: {
          arguments: {
            path: 'test.yml',
            outputJson: 'results.json'
          }
        }
      };

      const result = await tool.call(request as any);
      
      expect(result.status).toBe('ok');
      expect(result.data).toEqual(mockResult);
      expect(mockArtillery.runTestFromFile).toHaveBeenCalledWith('test.yml', {
        outputJson: 'results.json',
        reportHtml: undefined,
        env: undefined,
        cwd: undefined
      });
    });

    it('should handle errors gracefully', async () => {
      const tool = new RunTestFromFileTool(mockArtillery);
      mockArtillery.runTestFromFile.mockRejectedValue(new Error('Test failed'));

      const request = {
        params: {
          arguments: {
            path: 'test.yml'
          }
        }
      };

      const result = await tool.call(request as any);
      
      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toBe('Test failed');
    });
  });

  describe('RunTestInlineTool', () => {
    it('should validate input schema', async () => {
      const tool = new RunTestInlineTool(mockArtillery);
      
      expect(tool.name).toBe('run_test_inline');
      expect(tool.description).toBe('Run an Artillery test from an inline config string.');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should handle dry-run validation', async () => {
      const tool = new RunTestInlineTool(mockArtillery);
      const request = {
        params: {
          arguments: {
            configText: 'config: { target: "http://example.com" }',
            validateOnly: true
          }
        }
      };

      const result = await tool.call(request as any);
      
      expect(result.status).toBe('ok');
      expect(result.data?.logsTail).toContain('Inline configuration validated successfully');
    });

    it('should run inline test and return result', async () => {
      const tool = new RunTestInlineTool(mockArtillery);
      const mockResult = {
        exitCode: 0,
        elapsedMs: 3000,
        logsTail: 'Inline test completed',
        summary: { requestsTotal: 50, rpsAvg: 5 }
      };

      mockArtillery.runTestInline.mockResolvedValue(mockResult);

      const request = {
        params: {
          arguments: {
            configText: 'config: { target: "http://example.com" }'
          }
        }
      };

      const result = await tool.call(request as any);
      
      expect(result.status).toBe('ok');
      expect(result.data).toEqual(mockResult);
    });
  });

  describe('QuickTestTool', () => {
    it('should validate input schema', async () => {
      const tool = new QuickTestTool(mockArtillery);
      
      expect(tool.name).toBe('quick_test');
      expect(tool.description).toBe('Run a quick HTTP test (if supported by Artillery).');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should run quick test and return result', async () => {
      const tool = new QuickTestTool(mockArtillery);
      const mockResult = {
        exitCode: 0,
        elapsedMs: 1000,
        logsTail: 'Quick test completed',
        summary: { requestsTotal: 10, rpsAvg: 1 }
      };

      mockArtillery.quickTest.mockResolvedValue(mockResult);

      const request = {
        params: {
          arguments: {
            target: 'http://example.com',
            rate: 5,
            duration: '1m'
          }
        }
      };

      const result = await tool.call(request as any);
      
      expect(result.status).toBe('ok');
      expect(result.data).toEqual(mockResult);
      expect(mockArtillery.quickTest).toHaveBeenCalledWith({
        target: 'http://example.com',
        rate: 5,
        duration: '1m',
        count: undefined,
        method: undefined,
        headers: undefined,
        body: undefined
      });
    });
  });

  describe('ListCapabilitiesTool', () => {
    it('should validate input schema', async () => {
      const tool = new ListCapabilitiesTool(mockArtillery, mockConfig, '1.0.0');
      
      expect(tool.name).toBe('list_capabilities');
      expect(tool.description).toBe('Report versions, detected features, and server limits.');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should return server capabilities', async () => {
      const tool = new ListCapabilitiesTool(mockArtillery, mockConfig, '1.0.0');
      mockArtillery.getVersion.mockResolvedValue('Artillery v2.0.0');

      const request = {
        params: {
          arguments: {}
        }
      };

      const result = await tool.call(request as any);
      
      expect(result.status).toBe('ok');
      expect(result.data?.artilleryVersion).toBe('Artillery v2.0.0');
      expect(result.data?.serverVersion).toBe('1.0.0');
      expect(result.data?.transports).toContain('stdio');
      expect(result.data?.limits.allowQuick).toBe(true);
    });
  });

  describe('ParseResultsTool', () => {
    it('should validate input schema', async () => {
      const tool = new ParseResultsTool(mockArtillery);
      
      expect(tool.name).toBe('parse_results');
      expect(tool.description).toBe('Parse and summarize Artillery JSON results file.');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should parse results and return summary', async () => {
      const tool = new ParseResultsTool(mockArtillery);
      const mockResults = {
        metrics: {
          http: {
            requests: { count: 100, rate: 10.5 },
            response_time: { p50: 150, p95: 300, p99: 500 },
            errors: { ETIMEDOUT: 5 }
          }
        },
        scenarios: [
          { name: 'Test Scenario', count: 10, successRate: 95, avgLatency: 200 }
        ]
      };

      mockArtillery.parseResults.mockResolvedValue(mockResults);

      const request = {
        params: {
          arguments: {
            jsonPath: '/path/to/results.json'
          }
        }
      };

      const result = await tool.call(request as any);
      
      expect(result.status).toBe('ok');
      expect(result.data?.summary.requestsTotal).toBe(100);
      expect(result.data?.summary.rpsAvg).toBe(10.5);
      expect(result.data?.scenarios).toHaveLength(1);
    });

    it('should reject relative paths', async () => {
      const tool = new ParseResultsTool(mockArtillery);

      const request = {
        params: {
          arguments: {
            jsonPath: 'relative/path.json'
          }
        }
      };

      const result = await tool.call(request as any);
      
      expect(result.status).toBe('error');
      expect(result.error?.message).toBe('Path must be absolute');
    });
  });
});
