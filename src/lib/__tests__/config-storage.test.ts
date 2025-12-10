import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigStorage, SavedConfigEntry } from '../config-storage.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock fs
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    rename: vi.fn()
  }
}));

describe('ConfigStorage', () => {
  let storage: ConfigStorage;
  const workDir = '/tmp/artillery-tests';
  const storageDir = path.join(workDir, 'saved-configs');
  const indexPath = path.join(storageDir, 'index.json');

  beforeEach(() => {
    storage = new ConfigStorage(workDir);
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create storage directory and empty index', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await storage.initialize();

      expect(fs.mkdir).toHaveBeenCalledWith(storageDir, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should not overwrite existing index', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await storage.initialize();

      // writeFile should only be called for mkdir, not for index
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('save', () => {
    const mockIndex = { version: 1, configs: {} };

    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockIndex));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
    });

    it('should save a new config', async () => {
      const result = await storage.save({
        name: 'my-test-config',
        content: 'config:\n  target: https://example.com',
        description: 'Test config'
      });

      expect(result.name).toBe('my-test-config');
      expect(result.filename).toBe('my-test-config.yml');
      expect(result.description).toBe('Test config');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();

      // Verify config file was written
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(storageDir, 'my-test-config.yml'),
        'config:\n  target: https://example.com',
        'utf-8'
      );
    });

    it('should sanitize config names', async () => {
      const result = await storage.save({
        name: '  My Test Config!@#  ',
        content: 'config: {}'
      });

      expect(result.name).toBe('my-test-config');
      expect(result.filename).toBe('my-test-config.yml');
    });

    it('should convert spaces to hyphens', async () => {
      const result = await storage.save({
        name: 'smoke test baseline',
        content: 'config: {}'
      });

      expect(result.name).toBe('smoke-test-baseline');
    });

    it('should reject empty names', async () => {
      await expect(storage.save({
        name: '!!!',
        content: 'config: {}'
      })).rejects.toThrow('Invalid config name');
    });

    it('should reject names longer than 64 characters', async () => {
      const longName = 'a'.repeat(65);
      await expect(storage.save({
        name: longName,
        content: 'config: {}'
      })).rejects.toThrow('Config name must be 64 characters or less');
    });

    it('should update existing config preserving createdAt', async () => {
      const existingEntry: SavedConfigEntry = {
        name: 'existing-config',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        filename: 'existing-config.yml'
      };
      
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: { 'existing-config': existingEntry }
      }));

      const result = await storage.save({
        name: 'existing-config',
        content: 'updated content'
      });

      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
    });

    it('should save tags', async () => {
      const result = await storage.save({
        name: 'tagged-config',
        content: 'config: {}',
        tags: ['smoke', 'api']
      });

      expect(result.tags).toEqual(['smoke', 'api']);
    });
  });

  describe('list', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
    });

    it('should return empty list when no configs', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: {}
      }));

      const result = await storage.list();

      expect(result.count).toBe(0);
      expect(result.configs).toEqual([]);
    });

    it('should return configs sorted by updatedAt (newest first)', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: {
          'old-config': {
            name: 'old-config',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            filename: 'old-config.yml'
          },
          'new-config': {
            name: 'new-config',
            createdAt: '2024-06-01T00:00:00.000Z',
            updatedAt: '2024-06-01T00:00:00.000Z',
            filename: 'new-config.yml'
          }
        }
      }));

      const result = await storage.list();

      expect(result.count).toBe(2);
      expect(result.configs[0].name).toBe('new-config');
      expect(result.configs[1].name).toBe('old-config');
    });
  });

  describe('get', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
    });

    it('should return config entry and content', async () => {
      const mockEntry = {
        name: 'my-config',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        filename: 'my-config.yml'
      };

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          version: 1,
          configs: { 'my-config': mockEntry }
        }))
        .mockResolvedValueOnce('config:\n  target: https://example.com');

      const result = await storage.get('my-config');

      expect(result.entry).toEqual(mockEntry);
      expect(result.content).toBe('config:\n  target: https://example.com');
    });

    it('should throw error for non-existent config', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: {}
      }));

      await expect(storage.get('non-existent')).rejects.toThrow('Config not found');
    });

    it('should sanitize path traversal attempts', async () => {
      // Path traversal characters are stripped by sanitization
      // '../../etc/passwd' becomes 'etcpasswd' (a valid but non-existent name)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: {}
      }));

      await expect(storage.get('../../etc/passwd')).rejects.toThrow('Config not found: etcpasswd');
    });

    it('should reject completely invalid names', async () => {
      // Names that become empty after sanitization are rejected
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: {}
      }));

      await expect(storage.get('!!!')).rejects.toThrow('Invalid config name');
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
    });

    it('should delete config and return true', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: {
          'my-config': {
            name: 'my-config',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            filename: 'my-config.yml'
          }
        }
      }));

      const result = await storage.delete('my-config');

      expect(result).toBe(true);
      expect(fs.unlink).toHaveBeenCalledWith(
        path.join(storageDir, 'my-config.yml')
      );
    });

    it('should return false for non-existent config', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: {}
      }));

      const result = await storage.delete('non-existent');

      expect(result).toBe(false);
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('should handle file deletion errors gracefully', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: {
          'my-config': {
            name: 'my-config',
            filename: 'my-config.yml'
          }
        }
      }));
      vi.mocked(fs.unlink).mockRejectedValue(new Error('ENOENT'));

      // Should not throw, just continue with index cleanup
      const result = await storage.delete('my-config');
      expect(result).toBe(true);
    });
  });

  describe('exists', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
    });

    it('should return true for existing config', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: { 'my-config': { name: 'my-config' } }
      }));

      const result = await storage.exists('my-config');
      expect(result).toBe(true);
    });

    it('should return false for non-existent config', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        version: 1,
        configs: {}
      }));

      const result = await storage.exists('non-existent');
      expect(result).toBe(false);
    });

    it('should return false for invalid names', async () => {
      const result = await storage.exists('!!!');
      expect(result).toBe(false);
    });
  });

  describe('getConfigPath', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
    });

    it('should return absolute path to config file', async () => {
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify({
          version: 1,
          configs: {
            'my-config': {
              name: 'my-config',
              filename: 'my-config.yml'
            }
          }
        }))
        .mockResolvedValueOnce('config: {}');

      const result = await storage.getConfigPath('my-config');
      expect(result).toBe(path.join(storageDir, 'my-config.yml'));
    });
  });

  describe('index corruption recovery', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);
    });

    it('should recover from corrupted index', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json {{{');

      const result = await storage.list();

      expect(result.count).toBe(0);
      // Index should be recreated
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should recover from missing version field', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ configs: {} }));

      const result = await storage.list();

      expect(result.count).toBe(0);
    });
  });
});

