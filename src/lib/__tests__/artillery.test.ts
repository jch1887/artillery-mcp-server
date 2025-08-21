import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArtilleryWrapper } from '../artillery.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock fs and child_process
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    readFile: vi.fn()
  }
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn()
}));

describe('ArtilleryWrapper', () => {
  let artillery: ArtilleryWrapper;
  const mockConfig = {
    artilleryBin: '/usr/local/bin/artillery',
    workDir: '/tmp/artillery-tests',
    timeoutMs: 300000,
    maxOutputMb: 10,
    allowQuick: true
  };

  beforeEach(() => {
    artillery = new ArtilleryWrapper(mockConfig);
    vi.clearAllMocks();
  });

  describe('detectBinary', () => {
    it('should return ARTILLERY_BIN if set and accessible', async () => {
      process.env.ARTILLERY_BIN = '/custom/path/artillery';
      vi.mocked(fs.access).mockResolvedValue(undefined);
      
      const result = await ArtilleryWrapper.detectBinary();
      expect(result).toBe('/custom/path/artillery');
    });

    it('should throw error if ARTILLERY_BIN is not accessible', async () => {
      process.env.ARTILLERY_BIN = '/invalid/path/artillery';
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      
      await expect(ArtilleryWrapper.detectBinary()).rejects.toThrow(
        'ARTILLERY_BIN specified but not accessible: /invalid/path/artillery'
      );
    });
  });

  describe('getVersion', () => {
    it('should return Artillery version', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Mock successful completion
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
      });
      
      // Mock stdout data
      mockChild.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Artillery v2.0.0\n')), 0);
        }
      });

      const result = await artillery.getVersion();
      expect(result).toBe('Artillery v2.0.0');
    });
  });

  describe('runTestFromFile', () => {
    it('should validate and sanitize file path', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      
      // Mock successful completion
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
      });
      
      mockChild.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Test completed\n')), 0);
        }
      });

      const result = await artillery.runTestFromFile('test.yml');
      
      expect(result.exitCode).toBe(0);
      expect(result.elapsedMs).toBeGreaterThan(0);
    });

    it('should reject paths outside working directory', async () => {
      await expect(artillery.runTestFromFile('/etc/passwd')).rejects.toThrow(
        'Path /etc/passwd is outside allowed working directory'
      );
    });
  });

  describe('runTestInline', () => {
    it('should create temp file and run test', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
      });
      
      mockChild.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Test completed\n')), 0);
        }
      });

      const result = await artillery.runTestInline('config: { target: "http://example.com" }');
      
      expect(result.exitCode).toBe(0);
      expect(fs.writeFile).toHaveBeenCalled();
      expect(fs.unlink).toHaveBeenCalled();
    });
  });

  describe('quickTest', () => {
    it('should throw error if quick tests are disabled', async () => {
      const disabledArtillery = new ArtilleryWrapper({
        ...mockConfig,
        allowQuick: false
      });

      await expect(disabledArtillery.quickTest({ target: 'http://example.com' }))
        .rejects.toThrow('Quick tests are disabled');
    });

    it('should run quick test with rate and duration', async () => {
      const { spawn } = await import('child_process');
      const mockSpawn = vi.mocked(spawn);
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      };
      
      mockSpawn.mockReturnValue(mockChild as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      
      mockChild.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 0);
        }
      });
      
      mockChild.stdout.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback(Buffer.from('Quick test completed\n')), 0);
        }
      });

      const result = await artillery.quickTest({
        target: 'http://example.com',
        rate: 5,
        duration: '1m'
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('parseResults', () => {
    it('should parse JSON results file', async () => {
      const mockResults = {
        metrics: {
          http: {
            requests: { count: 100, rate: 10.5 },
            response_time: { p50: 150, p95: 300, p99: 500 },
            errors: { ETIMEDOUT: 5 }
          }
        }
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockResults));

      const result = await artillery.parseResults('/path/to/results.json');
      expect(result).toEqual(mockResults);
    });

    it('should throw error for invalid JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      await expect(artillery.parseResults('/path/to/results.json'))
        .rejects.toThrow('Failed to parse results file');
    });
  });
});
