import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WizardStartTool } from '../wizard-start.js';
import { WizardStepTool } from '../wizard-step.js';
import { WizardFinalizeTool } from '../wizard-finalize.js';
import { ConfigStorage } from '../../lib/config-storage.js';
import { ArtilleryWrapper } from '../../lib/artillery.js';
import { createWizardState, advanceWizard } from '../../lib/wizard.js';

// Mock ConfigStorage
vi.mock('../../lib/config-storage.js', () => ({
  ConfigStorage: vi.fn()
}));

// Mock ArtilleryWrapper
vi.mock('../../lib/artillery.js', () => ({
  ArtilleryWrapper: vi.fn()
}));

describe('Wizard Tools', () => {
  let mockStorage: {
    get: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let mockArtillery: {
    runTestInline: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockStorage = {
      get: vi.fn(),
      save: vi.fn()
    };
    mockArtillery = {
      runTestInline: vi.fn()
    };
    vi.clearAllMocks();
  });

  describe('WizardStartTool', () => {
    it('should have correct metadata', () => {
      const tool = new WizardStartTool(mockStorage as unknown as ConfigStorage);
      expect(tool.name).toBe('wizard_start');
      expect(tool.description).toContain('wizard');
    });

    it('should create initial wizard state', async () => {
      const tool = new WizardStartTool(mockStorage as unknown as ConfigStorage);

      const result = await tool.call({
        params: { arguments: {} }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.state.currentStep).toBe('target');
      expect(result.data?.state.isComplete).toBe(false);
      expect(result.data?.stepInfo.title).toBe('Target URL');
    });

    it('should start from saved config if provided', async () => {
      const tool = new WizardStartTool(mockStorage as unknown as ConfigStorage);
      mockStorage.get.mockResolvedValue({
        content: "config:\n  target: 'https://saved.example.com'"
      });

      const result = await tool.call({
        params: {
          arguments: { fromSavedConfig: 'my-config' }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.state.data.target).toBe('https://saved.example.com');
    });

    it('should handle saved config not found', async () => {
      const tool = new WizardStartTool(mockStorage as unknown as ConfigStorage);
      mockStorage.get.mockRejectedValue(new Error('Config not found'));

      const result = await tool.call({
        params: {
          arguments: { fromSavedConfig: 'nonexistent' }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('Config not found');
    });
  });

  describe('WizardStepTool', () => {
    it('should have correct metadata', () => {
      const tool = new WizardStepTool();
      expect(tool.name).toBe('wizard_step');
      expect(tool.inputSchema.required).toContain('state');
      expect(tool.inputSchema.required).toContain('action');
    });

    it('should advance wizard from target to test_type', async () => {
      const tool = new WizardStepTool();
      const initialState = createWizardState();

      const result = await tool.call({
        params: {
          arguments: {
            state: initialState,
            action: 'set_target',
            value: 'https://api.example.com'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.state.currentStep).toBe('test_type');
      expect(result.data?.state.data.target).toBe('https://api.example.com');
    });

    it('should return errors for invalid input', async () => {
      const tool = new WizardStepTool();
      const initialState = createWizardState();

      const result = await tool.call({
        params: {
          arguments: {
            state: initialState,
            action: 'set_target',
            value: 'not-a-url'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.state.errors.length).toBeGreaterThan(0);
      expect(result.data?.state.currentStep).toBe('target'); // Still at target step
    });

    it('should validate required state', async () => {
      const tool = new WizardStepTool();

      const result = await tool.call({
        params: {
          arguments: {
            action: 'set_target',
            value: 'https://example.com'
          }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should complete full wizard flow', async () => {
      const tool = new WizardStepTool();
      
      // Step 1: Target
      let state = createWizardState();
      let result = await tool.call({
        params: {
          arguments: {
            state,
            action: 'set_target',
            value: 'https://api.example.com'
          }
        }
      });
      state = result.data?.state!;
      expect(state.currentStep).toBe('test_type');

      // Step 2: Test type
      result = await tool.call({
        params: {
          arguments: {
            state,
            action: 'set_test_type',
            value: 'smoke'
          }
        }
      });
      state = result.data?.state!;
      expect(state.currentStep).toBe('scenarios');

      // Step 3: Scenarios
      result = await tool.call({
        params: {
          arguments: {
            state,
            action: 'set_scenarios',
            value: {
              requests: [{ method: 'GET', url: '/health' }]
            }
          }
        }
      });
      state = result.data?.state!;
      expect(state.currentStep).toBe('review');

      // Step 4: Confirm
      result = await tool.call({
        params: {
          arguments: {
            state,
            action: 'confirm',
            value: true
          }
        }
      });
      state = result.data?.state!;
      expect(state.isComplete).toBe(true);
    });
  });

  describe('WizardFinalizeTool', () => {
    it('should have correct metadata', () => {
      const tool = new WizardFinalizeTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );
      expect(tool.name).toBe('wizard_finalize');
      expect(tool.inputSchema.required).toContain('state');
    });

    it('should generate config from completed wizard', async () => {
      const tool = new WizardFinalizeTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );

      // Create a completed wizard state
      let state = createWizardState();
      state = advanceWizard(state, { action: 'set_target', value: 'https://example.com' });
      state = advanceWizard(state, { action: 'set_test_type', value: 'smoke' });
      state = advanceWizard(state, {
        action: 'set_scenarios',
        value: { requests: [{ method: 'GET', url: '/test' }] }
      });
      state = advanceWizard(state, { action: 'confirm', value: true });

      const result = await tool.call({
        params: {
          arguments: { state }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.config.configYaml).toContain('https://example.com');
      expect(result.data?.config.summary.testType).toBe('smoke');
    });

    it('should reject incomplete wizard', async () => {
      const tool = new WizardFinalizeTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );

      const incompleteState = createWizardState();

      const result = await tool.call({
        params: {
          arguments: { state: incompleteState }
        }
      });

      expect(result.status).toBe('error');
      expect(result.error?.message).toContain('not complete');
    });

    it('should save config if saveAsConfig is set', async () => {
      const tool = new WizardFinalizeTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );
      mockStorage.save.mockResolvedValue({ name: 'my-config' });

      // Create completed state with save request
      let state = createWizardState();
      state = advanceWizard(state, { action: 'set_target', value: 'https://example.com' });
      state = advanceWizard(state, { action: 'set_test_type', value: 'smoke' });
      state = advanceWizard(state, {
        action: 'set_scenarios',
        value: { requests: [{ method: 'GET', url: '/test' }] }
      });
      state = advanceWizard(state, {
        action: 'save_as',
        value: { configName: 'my-config', description: 'My test' }
      });

      const result = await tool.call({
        params: {
          arguments: { state }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.savedAs).toBe('my-config');
      expect(mockStorage.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my-config',
          description: 'My test'
        })
      );
    });

    it('should run test immediately if requested', async () => {
      const tool = new WizardFinalizeTool(
        mockArtillery as unknown as ArtilleryWrapper,
        mockStorage as unknown as ConfigStorage
      );
      mockArtillery.runTestInline.mockResolvedValue({
        exitCode: 0,
        elapsedMs: 5000,
        logsTail: 'Test completed'
      });

      // Create completed state
      let state = createWizardState();
      state = advanceWizard(state, { action: 'set_target', value: 'https://example.com' });
      state = advanceWizard(state, { action: 'set_test_type', value: 'smoke' });
      state = advanceWizard(state, {
        action: 'set_scenarios',
        value: { requests: [{ method: 'GET', url: '/test' }] }
      });
      state = advanceWizard(state, { action: 'confirm', value: true });

      const result = await tool.call({
        params: {
          arguments: {
            state,
            runImmediately: true,
            outputJson: '/path/to/results.json'
          }
        }
      });

      expect(result.status).toBe('ok');
      expect(result.data?.testResult?.exitCode).toBe(0);
      expect(mockArtillery.runTestInline).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ outputJson: '/path/to/results.json' })
      );
    });
  });
});




