import { describe, it, expect, beforeEach } from 'vitest';
import { 
  createWizardState, 
  advanceWizard, 
  generateConfig,
  getStepInfo,
  TEST_PRESETS,
  WizardState
} from '../wizard.js';

describe('Wizard State Machine', () => {
  describe('createWizardState', () => {
    it('should create initial state at target step', () => {
      const state = createWizardState();
      
      expect(state.currentStep).toBe('target');
      expect(state.data).toEqual({});
      expect(state.errors).toEqual([]);
      expect(state.isComplete).toBe(false);
    });

    it('should accept initial data from saved config', () => {
      const state = createWizardState({ target: 'https://example.com' });
      
      expect(state.data.target).toBe('https://example.com');
    });
  });

  describe('Target Step', () => {
    it('should accept valid URL and move to test_type', () => {
      const state = createWizardState();
      const newState = advanceWizard(state, { 
        action: 'set_target', 
        value: 'https://api.example.com' 
      });

      expect(newState.currentStep).toBe('test_type');
      expect(newState.data.target).toBe('https://api.example.com');
      expect(newState.errors).toEqual([]);
    });

    it('should reject empty URL', () => {
      const state = createWizardState();
      const newState = advanceWizard(state, { 
        action: 'set_target', 
        value: '' 
      });

      expect(newState.currentStep).toBe('target');
      expect(newState.errors).toContain('Target URL is required');
    });

    it('should reject invalid URL format', () => {
      const state = createWizardState();
      const newState = advanceWizard(state, { 
        action: 'set_target', 
        value: 'not-a-url' 
      });

      expect(newState.currentStep).toBe('target');
      expect(newState.errors[0]).toContain('Invalid URL');
    });

    it('should reject unknown action', () => {
      const state = createWizardState();
      const newState = advanceWizard(state, { 
        action: 'unknown', 
        value: 'test' 
      });

      expect(newState.errors[0]).toContain('Unknown action');
    });
  });

  describe('Test Type Step', () => {
    let stateAtTestType: WizardState;

    beforeEach(() => {
      const initial = createWizardState();
      stateAtTestType = advanceWizard(initial, { 
        action: 'set_target', 
        value: 'https://example.com' 
      });
    });

    it('should apply smoke preset and skip to scenarios', () => {
      const newState = advanceWizard(stateAtTestType, {
        action: 'set_test_type',
        value: 'smoke'
      });

      expect(newState.currentStep).toBe('scenarios');
      expect(newState.data.testType).toBe('smoke');
      expect(newState.data.loadProfile).toEqual(TEST_PRESETS.smoke.profile);
    });

    it('should apply baseline preset', () => {
      const newState = advanceWizard(stateAtTestType, {
        action: 'set_test_type',
        value: 'baseline'
      });

      expect(newState.data.testType).toBe('baseline');
      expect(newState.data.loadProfile).toEqual(TEST_PRESETS.baseline.profile);
    });

    it('should go to load_profile for custom type', () => {
      const newState = advanceWizard(stateAtTestType, {
        action: 'set_test_type',
        value: 'custom'
      });

      expect(newState.currentStep).toBe('load_profile');
      expect(newState.data.testType).toBe('custom');
    });

    it('should reject invalid test type', () => {
      const newState = advanceWizard(stateAtTestType, {
        action: 'set_test_type',
        value: 'invalid'
      });

      expect(newState.errors[0]).toContain('Invalid test type');
    });
  });

  describe('Load Profile Step', () => {
    let stateAtLoadProfile: WizardState;

    beforeEach(() => {
      let state = createWizardState();
      state = advanceWizard(state, { action: 'set_target', value: 'https://example.com' });
      stateAtLoadProfile = advanceWizard(state, { action: 'set_test_type', value: 'custom' });
    });

    it('should accept valid load profile', () => {
      const newState = advanceWizard(stateAtLoadProfile, {
        action: 'set_load_profile',
        value: {
          phases: [
            { duration: 60, arrivalRate: 10 }
          ]
        }
      });

      expect(newState.currentStep).toBe('scenarios');
      expect(newState.data.loadProfile?.phases).toHaveLength(1);
    });

    it('should reject empty phases', () => {
      const newState = advanceWizard(stateAtLoadProfile, {
        action: 'set_load_profile',
        value: { phases: [] }
      });

      expect(newState.errors[0]).toContain('at least one phase');
    });

    it('should reject negative duration', () => {
      const newState = advanceWizard(stateAtLoadProfile, {
        action: 'set_load_profile',
        value: {
          phases: [{ duration: -1, arrivalRate: 10 }]
        }
      });

      expect(newState.errors[0]).toContain('positive duration');
    });

    it('should warn about aggressive load profiles', () => {
      const newState = advanceWizard(stateAtLoadProfile, {
        action: 'set_load_profile',
        value: {
          phases: [{ duration: 60, arrivalRate: 150 }]
        }
      });

      expect(newState.errors[0]).toContain('> 100 req/s');
    });

    it('should allow confirming aggressive profile', () => {
      let state = advanceWizard(stateAtLoadProfile, {
        action: 'set_load_profile',
        value: { phases: [{ duration: 60, arrivalRate: 150 }] }
      });

      // User confirms
      state = advanceWizard(state, { action: 'confirm_aggressive', value: true });

      expect(state.currentStep).toBe('scenarios');
    });
  });

  describe('Scenarios Step', () => {
    let stateAtScenarios: WizardState;

    beforeEach(() => {
      let state = createWizardState();
      state = advanceWizard(state, { action: 'set_target', value: 'https://example.com' });
      stateAtScenarios = advanceWizard(state, { action: 'set_test_type', value: 'smoke' });
    });

    it('should accept valid scenarios', () => {
      const newState = advanceWizard(stateAtScenarios, {
        action: 'set_scenarios',
        value: {
          requests: [
            { method: 'GET', url: '/api/health' },
            { method: 'POST', url: '/api/data', body: { key: 'value' } }
          ],
          scenarioName: 'My Test'
        }
      });

      expect(newState.currentStep).toBe('review');
      expect(newState.data.requests).toHaveLength(2);
      expect(newState.data.scenarioName).toBe('My Test');
    });

    it('should reject empty requests', () => {
      const newState = advanceWizard(stateAtScenarios, {
        action: 'set_scenarios',
        value: { requests: [] }
      });

      expect(newState.errors[0]).toContain('At least one request');
    });

    it('should reject invalid HTTP method', () => {
      const newState = advanceWizard(stateAtScenarios, {
        action: 'set_scenarios',
        value: {
          requests: [{ method: 'INVALID', url: '/test' }]
        }
      });

      expect(newState.errors[0]).toContain('Invalid HTTP method');
    });
  });

  describe('Review Step', () => {
    let stateAtReview: WizardState;

    beforeEach(() => {
      let state = createWizardState();
      state = advanceWizard(state, { action: 'set_target', value: 'https://example.com' });
      state = advanceWizard(state, { action: 'set_test_type', value: 'smoke' });
      stateAtReview = advanceWizard(state, {
        action: 'set_scenarios',
        value: {
          requests: [{ method: 'GET', url: '/api/health' }]
        }
      });
    });

    it('should confirm and complete', () => {
      const newState = advanceWizard(stateAtReview, {
        action: 'confirm',
        value: true
      });

      expect(newState.currentStep).toBe('complete');
      expect(newState.isComplete).toBe(true);
    });

    it('should allow going back', () => {
      const newState = advanceWizard(stateAtReview, {
        action: 'go_back',
        value: null
      });

      expect(newState.currentStep).toBe('scenarios');
    });

    it('should save as config', () => {
      const newState = advanceWizard(stateAtReview, {
        action: 'save_as',
        value: { configName: 'my-config', description: 'Test config' }
      });

      expect(newState.isComplete).toBe(true);
      expect(newState.data.saveAsConfig).toBe('my-config');
      expect(newState.data.configDescription).toBe('Test config');
    });
  });

  describe('generateConfig', () => {
    it('should generate valid YAML config', () => {
      // Run through complete wizard flow
      let state = createWizardState();
      state = advanceWizard(state, { action: 'set_target', value: 'https://api.example.com' });
      state = advanceWizard(state, { action: 'set_test_type', value: 'smoke' });
      state = advanceWizard(state, {
        action: 'set_scenarios',
        value: {
          requests: [
            { method: 'GET', url: '/health' },
            { method: 'POST', url: '/data', body: { test: true } }
          ],
          scenarioName: 'API Test'
        }
      });
      state = advanceWizard(state, { action: 'confirm', value: true });

      const result = generateConfig(state);

      expect(result.configYaml).toContain("target: 'https://api.example.com'");
      expect(result.configYaml).toContain('duration: 30');
      expect(result.configYaml).toContain('arrivalRate: 1');
      expect(result.configYaml).toContain("name: 'API Test'");
      expect(result.configYaml).toContain("url: '/health'");
      expect(result.configYaml).toContain("url: '/data'");
      
      expect(result.summary.target).toBe('https://api.example.com');
      expect(result.summary.testType).toBe('smoke');
      expect(result.summary.requestCount).toBe(2);
    });

    it('should throw if wizard not complete', () => {
      const state = createWizardState();
      
      expect(() => generateConfig(state)).toThrow('not complete');
    });
  });

  describe('getStepInfo', () => {
    it('should return info for each step', () => {
      const targetInfo = getStepInfo('target');
      expect(targetInfo.title).toBe('Target URL');
      expect(targetInfo.stepNumber).toBe(1);

      const reviewInfo = getStepInfo('review');
      expect(reviewInfo.title).toBe('Review & Generate');
      expect(reviewInfo.stepNumber).toBe(5);
    });
  });

  describe('Full Wizard Flow', () => {
    it('should complete smoke test flow', () => {
      let state = createWizardState();
      
      // Step 1: Target
      state = advanceWizard(state, { 
        action: 'set_target', 
        value: 'https://httpbin.org' 
      });
      expect(state.currentStep).toBe('test_type');

      // Step 2: Test Type (smoke)
      state = advanceWizard(state, { 
        action: 'set_test_type', 
        value: 'smoke' 
      });
      expect(state.currentStep).toBe('scenarios');

      // Step 3: Scenarios
      state = advanceWizard(state, {
        action: 'set_scenarios',
        value: {
          requests: [
            { method: 'GET', url: '/get' },
            { method: 'POST', url: '/post', body: { message: 'test' } }
          ]
        }
      });
      expect(state.currentStep).toBe('review');

      // Step 4: Confirm
      state = advanceWizard(state, { 
        action: 'confirm', 
        value: true 
      });
      expect(state.isComplete).toBe(true);

      // Generate config
      const result = generateConfig(state);
      expect(result.summary.testType).toBe('smoke');
      expect(result.summary.totalDuration).toBe(30);
    });

    it('should complete custom profile flow', () => {
      let state = createWizardState();
      
      state = advanceWizard(state, { action: 'set_target', value: 'https://example.com' });
      state = advanceWizard(state, { action: 'set_test_type', value: 'custom' });
      
      // Should be at load_profile step
      expect(state.currentStep).toBe('load_profile');
      
      state = advanceWizard(state, {
        action: 'set_load_profile',
        value: {
          phases: [
            { duration: 30, arrivalRate: 5 },
            { duration: 60, arrivalRate: 15 },
            { duration: 30, arrivalRate: 5 }
          ]
        }
      });
      expect(state.currentStep).toBe('scenarios');

      state = advanceWizard(state, {
        action: 'set_scenarios',
        value: { requests: [{ method: 'GET', url: '/test' }] }
      });

      state = advanceWizard(state, { action: 'confirm', value: true });

      const result = generateConfig(state);
      expect(result.summary.totalDuration).toBe(120);
    });
  });
});

