import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaveConfigTool } from '../save-config.js';
import { ListConfigsTool } from '../list-configs.js';
import { GetConfigTool } from '../get-config.js';
import { DeleteConfigTool } from '../delete-config.js';
import { RunSavedConfigTool } from '../run-saved-config.js';
import { ConfigStorage, SavedConfigEntry } from '../../lib/config-storage.js';
import { ArtilleryWrapper } from '../../lib/artillery.js';

// Mock ConfigStorage
vi.mock('../../lib/config-storage.js', () => ({
  ConfigStorage: vi.fn()
}));

// Mock ArtilleryWrapper
vi.mock('../../lib/artillery.js', () => ({
  ArtilleryWrapper: vi.fn()
}));

describe('Saved Config Tools', () => {
  let mockStorage: {
    save: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    getConfigPath: ReturnType<typeof vi.fn>;
  };
  let mockArtillery: {
    runTestFromFile: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockStorage = {
      save: vi.fn(),
      list: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      getConfigPath: vi.fn()
    };

    mockArtillery = {
      runTestFromFile: vi.fn()
    };

    vi.clearAllMocks();
  });

  describe('SaveConfigTool', () => {
    it('should have correct metadata', () => {
      const tool = new SaveConfigTool(mockStorage as unknown as ConfigStorage);
      expect(tool.name).toBe('save_config');
      expect(tool.description).toContain('Save');
      expect(tool.inputSchema.required).toContain('name');
      expect(tool.inputSchema.required).toContain('content');
    });

    it('should save a new config successfully', async () => {
      const tool = new SaveConfigTool(mockStorage as unknown as ConfigStorage);
      const mockEntry: SavedConfigEntry = {
        name: 'my-test',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        filename: 'my-test.yml',
        description: 'Test config'
      };

      mockStorage.save.mockResolvedValue(mockEntry);

      const result = await tool.call({
        params: {
          arguments: {
            name: 'my-test',
            content: 'config:\n  target: https://example.com',
            description: 'Test config'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data).toEqual(mockEntry);
      expect(mockStorage.save).toHaveBeenCalledWith({
        name: 'my-test',
        content: 'config:\n  target: https://example.com',
        description: 'Test config',
        tags: undefined
      });
    });

    it('should validate required name field', async () => {
      const tool = new SaveConfigTool(mockStorage as unknown as ConfigStorage);

      const result = await tool.call({
        params: {
          arguments: {
            content: 'config: {}'
          }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('name');
    });

    it('should validate required content field', async () => {
      const tool = new SaveConfigTool(mockStorage as unknown as ConfigStorage);

      const result = await tool.call({
        params: {
          arguments: {
            name: 'test'
          }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.message).toContain('content');
    });

    it('should handle storage errors', async () => {
      const tool = new SaveConfigTool(mockStorage as unknown as ConfigStorage);
      mockStorage.save.mockRejectedValue(new Error('Storage error'));

      const result = await tool.call({
        params: {
          arguments: {
            name: 'test',
            content: 'config: {}'
          }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toBe('Storage error');
    });

    it('should save config with tags', async () => {
      const tool = new SaveConfigTool(mockStorage as unknown as ConfigStorage);
      mockStorage.save.mockResolvedValue({
        name: 'tagged-config',
        tags: ['smoke', 'api']
      });

      const result = await tool.call({
        params: {
          arguments: {
            name: 'tagged-config',
            content: 'config: {}',
            tags: ['smoke', 'api']
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(mockStorage.save).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['smoke', 'api'] })
      );
    });
  });

  describe('ListConfigsTool', () => {
    it('should have correct metadata', () => {
      const tool = new ListConfigsTool(mockStorage as unknown as ConfigStorage);
      expect(tool.name).toBe('list_configs');
      expect(tool.description).toContain('List');
    });

    it('should list all configs', async () => {
      const tool = new ListConfigsTool(mockStorage as unknown as ConfigStorage);
      const mockResult = {
        count: 2,
        configs: [
          { name: 'config-1', filename: 'config-1.yml' },
          { name: 'config-2', filename: 'config-2.yml' }
        ]
      };

      mockStorage.list.mockResolvedValue(mockResult);

      const result = await tool.call({
        params: { arguments: {} }
      });

      expect(result.status).toBe('ok');
      expect(result.data).toEqual(mockResult);
    });

    it('should filter by tag', async () => {
      const tool = new ListConfigsTool(mockStorage as unknown as ConfigStorage);
      mockStorage.list.mockResolvedValue({
        count: 2,
        configs: [
          { name: 'config-1', tags: ['smoke'] },
          { name: 'config-2', tags: ['api'] }
        ]
      });

      const result = await tool.call({
        params: {
          arguments: { tag: 'smoke' }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.count).toBe(1);
      expect(result.data?.configs[0].name).toBe('config-1');
    });

    it('should return empty list when no matches', async () => {
      const tool = new ListConfigsTool(mockStorage as unknown as ConfigStorage);
      mockStorage.list.mockResolvedValue({
        count: 1,
        configs: [{ name: 'config-1', tags: ['api'] }]
      });

      const result = await tool.call({
        params: {
          arguments: { tag: 'nonexistent' }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.count).toBe(0);
    });
  });

  describe('GetConfigTool', () => {
    it('should have correct metadata', () => {
      const tool = new GetConfigTool(mockStorage as unknown as ConfigStorage);
      expect(tool.name).toBe('get_config');
      expect(tool.description).toContain('Retrieve');
      expect(tool.inputSchema.required).toContain('name');
    });

    it('should get a config by name', async () => {
      const tool = new GetConfigTool(mockStorage as unknown as ConfigStorage);
      const mockResult = {
        entry: { name: 'my-config', filename: 'my-config.yml' },
        content: 'config:\n  target: https://example.com'
      };

      mockStorage.get.mockResolvedValue(mockResult);

      const result = await tool.call({
        params: {
          arguments: { name: 'my-config' }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data).toEqual(mockResult);
    });

    it('should validate required name field', async () => {
      const tool = new GetConfigTool(mockStorage as unknown as ConfigStorage);

      const result = await tool.call({
        params: { arguments: {} }
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should handle not found errors', async () => {
      const tool = new GetConfigTool(mockStorage as unknown as ConfigStorage);
      mockStorage.get.mockRejectedValue(new Error('Config not found: unknown'));

      const result = await tool.call({
        params: {
          arguments: { name: 'unknown' }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('not found');
    });
  });

  describe('DeleteConfigTool', () => {
    it('should have correct metadata', () => {
      const tool = new DeleteConfigTool(mockStorage as unknown as ConfigStorage);
      expect(tool.name).toBe('delete_config');
      expect(tool.description).toContain('Delete');
      expect(tool.inputSchema.required).toContain('name');
    });

    it('should delete a config', async () => {
      const tool = new DeleteConfigTool(mockStorage as unknown as ConfigStorage);
      mockStorage.delete.mockResolvedValue(true);

      const result = await tool.call({
        params: {
          arguments: { name: 'my-config' }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.deleted).toBe(true);
      expect(result.data?.name).toBe('my-config');
    });

    it('should return false when config not found', async () => {
      const tool = new DeleteConfigTool(mockStorage as unknown as ConfigStorage);
      mockStorage.delete.mockResolvedValue(false);

      const result = await tool.call({
        params: {
          arguments: { name: 'nonexistent' }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.deleted).toBe(false);
    });

    it('should validate required name field', async () => {
      const tool = new DeleteConfigTool(mockStorage as unknown as ConfigStorage);

      const result = await tool.call({
        params: { arguments: {} }
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('RunSavedConfigTool', () => {
    it('should have correct metadata', () => {
      const tool = new RunSavedConfigTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );
      expect(tool.name).toBe('run_saved_config');
      expect(tool.description).toContain('Run');
      expect(tool.inputSchema.required).toContain('name');
    });

    it('should run a saved config', async () => {
      const tool = new RunSavedConfigTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );

      mockStorage.getConfigPath.mockResolvedValue('/path/to/saved-configs/my-config.yml');
      mockArtillery.runTestFromFile.mockResolvedValue({
        exitCode: 0,
        elapsedMs: 5000,
        logsTail: 'Test completed',
        summary: { requestsTotal: 100 }
      });

      const result = await tool.call({
        params: {
          arguments: {
            name: 'my-config',
            outputJson: '/path/to/results.json'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.exitCode).toBe(0);
      expect(mockStorage.getConfigPath).toHaveBeenCalledWith('my-config');
      expect(mockArtillery.runTestFromFile).toHaveBeenCalledWith(
        '/path/to/saved-configs/my-config.yml',
        {
          outputJson: '/path/to/results.json',
          reportHtml: undefined,
          env: undefined
        }
      );
    });

    it('should handle validateOnly mode', async () => {
      const tool = new RunSavedConfigTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );

      mockStorage.getConfigPath.mockResolvedValue('/path/to/saved-configs/my-config.yml');

      const result = await tool.call({
        params: {
          arguments: {
            name: 'my-config',
            validateOnly: true
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.exitCode).toBe(0);
      expect(result.data?.logsTail).toContain('validated successfully');
      expect(mockArtillery.runTestFromFile).not.toHaveBeenCalled();
    });

    it('should validate required name field', async () => {
      const tool = new RunSavedConfigTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );

      const result = await tool.call({
        params: { arguments: {} }
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should handle config not found error', async () => {
      const tool = new RunSavedConfigTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );

      mockStorage.getConfigPath.mockRejectedValue(new Error('Config not found: unknown'));

      const result = await tool.call({
        params: {
          arguments: { name: 'unknown' }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('not found');
    });

    it('should pass environment variables to Artillery', async () => {
      const tool = new RunSavedConfigTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );

      mockStorage.getConfigPath.mockResolvedValue('/path/config.yml');
      mockArtillery.runTestFromFile.mockResolvedValue({
        exitCode: 0,
        elapsedMs: 1000,
        logsTail: 'Done'
      });

      await tool.call({
        params: {
          arguments: {
            name: 'my-config',
            env: { API_KEY: 'secret123' }
          }
        }
      });

      expect(mockArtillery.runTestFromFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ env: { API_KEY: 'secret123' } })
      );
    });
  });
});




