import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunPresetTestTool } from '../run-preset-test.js';
import { CompareResultsTool } from '../compare-results.js';
import { ArtilleryWrapper } from '../../lib/artillery.js';

// Mock ArtilleryWrapper
vi.mock('../../lib/artillery.js', () => ({
  ArtilleryWrapper: vi.fn()
}));

describe('Advanced Testing Tools', () => {
  let mockArtillery: {
    runTestInline: ReturnType<typeof vi.fn>;
    parseResults: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockArtillery = {
      runTestInline: vi.fn(),
      parseResults: vi.fn()
    };
    vi.clearAllMocks();
  });

  describe('RunPresetTestTool', () => {
    it('should have correct metadata', () => {
      const tool = new RunPresetTestTool(mockArtillery as unknown as ArtilleryWrapper);
      expect(tool.name).toBe('run_preset_test');
      expect(tool.inputSchema.required).toContain('target');
      expect(tool.inputSchema.required).toContain('preset');
    });

    it('should run smoke test preset', async () => {
      const tool = new RunPresetTestTool(mockArtillery as unknown as ArtilleryWrapper);
      mockArtillery.runTestInline.mockResolvedValue({
        exitCode: 0,
        elapsedMs: 30000,
        logsTail: 'Test completed',
        summary: { requestsTotal: 30, rpsAvg: 1 }
      });

      const result = await tool.call({
        params: {
          arguments: {
            target: 'https://api.example.com',
            preset: 'smoke'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.preset.type).toBe('smoke');
      expect(result.data?.preset.name).toBe('Smoke Test');
      expect(result.data?.configYaml).toContain('https://api.example.com');
      expect(mockArtillery.runTestInline).toHaveBeenCalled();
    });

    it('should run baseline test preset', async () => {
      const tool = new RunPresetTestTool(mockArtillery as unknown as ArtilleryWrapper);
      mockArtillery.runTestInline.mockResolvedValue({
        exitCode: 0,
        elapsedMs: 120000,
        logsTail: 'Test completed'
      });

      const result = await tool.call({
        params: {
          arguments: {
            target: 'https://api.example.com',
            preset: 'baseline',
            path: '/api/health'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.preset.type).toBe('baseline');
      expect(result.data?.configYaml).toContain('/api/health');
    });

    it('should handle POST requests with body', async () => {
      const tool = new RunPresetTestTool(mockArtillery as unknown as ArtilleryWrapper);
      mockArtillery.runTestInline.mockResolvedValue({
        exitCode: 0,
        elapsedMs: 30000,
        logsTail: 'Test completed'
      });

      const result = await tool.call({
        params: {
          arguments: {
            target: 'https://api.example.com',
            preset: 'smoke',
            path: '/api/data',
            method: 'POST',
            body: { key: 'value' }
          }
        }
      });

      expect(result.status).toBe('ok');
      // Config should include the body
      expect(result.data?.configYaml).toContain('post:');
    });

    it('should validate target URL', async () => {
      const tool = new RunPresetTestTool(mockArtillery as unknown as ArtilleryWrapper);

      const result = await tool.call({
        params: {
          arguments: {
            target: 'not-a-url',
            preset: 'smoke'
          }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid preset', async () => {
      const tool = new RunPresetTestTool(mockArtillery as unknown as ArtilleryWrapper);

      const result = await tool.call({
        params: {
          arguments: {
            target: 'https://example.com',
            preset: 'invalid'
          }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('preset must be one of');
    });

    it('should pass output paths to artillery', async () => {
      const tool = new RunPresetTestTool(mockArtillery as unknown as ArtilleryWrapper);
      mockArtillery.runTestInline.mockResolvedValue({
        exitCode: 0,
        elapsedMs: 30000,
        logsTail: 'Test completed'
      });

      await tool.call({
        params: {
          arguments: {
            target: 'https://example.com',
            preset: 'smoke',
            outputJson: '/path/to/results.json',
            reportHtml: '/path/to/report.html'
          }
        }
      });

      expect(mockArtillery.runTestInline).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          outputJson: '/path/to/results.json',
          reportHtml: '/path/to/report.html'
        })
      );
    });
  });

  describe('CompareResultsTool', () => {
    it('should have correct metadata', () => {
      const tool = new CompareResultsTool(mockArtillery as unknown as ArtilleryWrapper);
      expect(tool.name).toBe('compare_results');
      expect(tool.inputSchema.required).toContain('baselinePath');
      expect(tool.inputSchema.required).toContain('currentPath');
    });

    it('should pass when metrics are similar', async () => {
      const tool = new CompareResultsTool(mockArtillery as unknown as ArtilleryWrapper);
      
      const baselineResults = {
        aggregate: {
          counters: { 'http.requests': 100, 'http.errors': 1 },
          rates: { 'http.request_rate': 10 },
          summaries: { 'http.response_time': { p50: 100, p95: 200, p99: 300 } }
        }
      };
      const currentResults = {
        aggregate: {
          counters: { 'http.requests': 100, 'http.errors': 1 },
          rates: { 'http.request_rate': 10 },
          summaries: { 'http.response_time': { p50: 105, p95: 210, p99: 310 } }
        }
      };

      mockArtillery.parseResults
        .mockResolvedValueOnce(baselineResults)
        .mockResolvedValueOnce(currentResults);

      const result = await tool.call({
        params: {
          arguments: {
            baselinePath: '/path/to/baseline.json',
            currentPath: '/path/to/current.json'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.passed).toBe(true);
      expect(result.data?.summary).toContain('PASSED');
    });

    it('should fail when latency increases beyond threshold', async () => {
      const tool = new CompareResultsTool(mockArtillery as unknown as ArtilleryWrapper);
      
      const baselineResults = {
        aggregate: {
          counters: { 'http.requests': 100, 'http.errors': 0 },
          rates: { 'http.request_rate': 10 },
          summaries: { 'http.response_time': { p50: 100, p95: 200, p99: 300 } }
        }
      };
      const currentResults = {
        aggregate: {
          counters: { 'http.requests': 100, 'http.errors': 0 },
          rates: { 'http.request_rate': 10 },
          summaries: { 'http.response_time': { p50: 150, p95: 300, p99: 450 } }
        }
      };

      mockArtillery.parseResults
        .mockResolvedValueOnce(baselineResults)
        .mockResolvedValueOnce(currentResults);

      const result = await tool.call({
        params: {
          arguments: {
            baselinePath: '/path/to/baseline.json',
            currentPath: '/path/to/current.json'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.passed).toBe(false);
      expect(result.data?.failures.length).toBeGreaterThan(0);
      expect(result.data?.failures[0]).toContain('latency');
    });

    it('should fail when throughput drops', async () => {
      const tool = new CompareResultsTool(mockArtillery as unknown as ArtilleryWrapper);
      
      const baselineResults = {
        aggregate: {
          counters: { 'http.requests': 100, 'http.errors': 0 },
          rates: { 'http.request_rate': 10 },
          summaries: { 'http.response_time': { p50: 100, p95: 200, p99: 300 } }
        }
      };
      const currentResults = {
        aggregate: {
          counters: { 'http.requests': 50, 'http.errors': 0 },
          rates: { 'http.request_rate': 5 }, // 50% drop
          summaries: { 'http.response_time': { p50: 100, p95: 200, p99: 300 } }
        }
      };

      mockArtillery.parseResults
        .mockResolvedValueOnce(baselineResults)
        .mockResolvedValueOnce(currentResults);

      const result = await tool.call({
        params: {
          arguments: {
            baselinePath: '/path/to/baseline.json',
            currentPath: '/path/to/current.json'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.passed).toBe(false);
      expect(result.data?.failures.some(f => f.includes('Throughput'))).toBe(true);
    });

    it('should detect improvements', async () => {
      const tool = new CompareResultsTool(mockArtillery as unknown as ArtilleryWrapper);
      
      const baselineResults = {
        aggregate: {
          counters: { 'http.requests': 100, 'http.errors': 5 },
          rates: { 'http.request_rate': 10 },
          summaries: { 'http.response_time': { p50: 200, p95: 400, p99: 600 } }
        }
      };
      const currentResults = {
        aggregate: {
          counters: { 'http.requests': 100, 'http.errors': 1 },
          rates: { 'http.request_rate': 12 },
          summaries: { 'http.response_time': { p50: 100, p95: 200, p99: 300 } }
        }
      };

      mockArtillery.parseResults
        .mockResolvedValueOnce(baselineResults)
        .mockResolvedValueOnce(currentResults);

      const result = await tool.call({
        params: {
          arguments: {
            baselinePath: '/path/to/baseline.json',
            currentPath: '/path/to/current.json'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.passed).toBe(true);
      expect(result.data?.latency.p95.status).toBe('improved');
      expect(result.data?.throughput.status).toBe('improved');
    });

    it('should use custom thresholds', async () => {
      const tool = new CompareResultsTool(mockArtillery as unknown as ArtilleryWrapper);
      
      const baselineResults = {
        aggregate: {
          counters: { 'http.requests': 100, 'http.errors': 0 },
          rates: { 'http.request_rate': 10 },
          summaries: { 'http.response_time': { p50: 100, p95: 200, p99: 300 } }
        }
      };
      const currentResults = {
        aggregate: {
          counters: { 'http.requests': 100, 'http.errors': 0 },
          rates: { 'http.request_rate': 10 },
          summaries: { 'http.response_time': { p50: 120, p95: 250, p99: 380 } }
        }
      };

      mockArtillery.parseResults
        .mockResolvedValueOnce(baselineResults)
        .mockResolvedValueOnce(currentResults);

      // With strict threshold (10%), should fail
      const strictResult = await tool.call({
        params: {
          arguments: {
            baselinePath: '/path/to/baseline.json',
            currentPath: '/path/to/current.json',
            thresholds: { maxLatencyIncrease: 0.1 }
          }
        }
      });

      expect(strictResult.data?.passed).toBe(false);

      // Reset mocks
      mockArtillery.parseResults
        .mockResolvedValueOnce(baselineResults)
        .mockResolvedValueOnce(currentResults);

      // With lenient threshold (50%), should pass
      const lenientResult = await tool.call({
        params: {
          arguments: {
            baselinePath: '/path/to/baseline.json',
            currentPath: '/path/to/current.json',
            thresholds: { maxLatencyIncrease: 0.5 }
          }
        }
      });

      expect(lenientResult.data?.passed).toBe(true);
    });

    it('should validate required paths', async () => {
      const tool = new CompareResultsTool(mockArtillery as unknown as ArtilleryWrapper);

      const result = await tool.call({
        params: {
          arguments: {
            baselinePath: '/path/to/baseline.json'
            // missing currentPath
          }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});




