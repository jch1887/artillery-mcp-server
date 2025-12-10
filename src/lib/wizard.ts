/**
 * Interactive Wizard State Machine
 * 
 * Implements a step-by-step wizard for building Artillery test configurations.
 * The wizard state is fully serializable and can be passed back and forth
 * between client and server, making it easy for AI agents to drive.
 */

// ============================================================================
// Types
// ============================================================================

/** Available test type presets */
export type TestType = 'smoke' | 'baseline' | 'soak' | 'spike' | 'custom';

/** Wizard step names */
export type WizardStep = 'target' | 'test_type' | 'load_profile' | 'scenarios' | 'review' | 'complete';

/** HTTP methods supported in scenarios */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** A single HTTP request in a scenario flow */
export interface ScenarioRequest {
  method: HttpMethod;
  url: string;
  /** Optional JSON body for POST/PUT/PATCH */
  body?: Record<string, unknown>;
  /** Optional headers */
  headers?: Record<string, string>;
}

/** Load profile configuration */
export interface LoadProfile {
  /** Phases configuration */
  phases: Array<{
    duration: number;
    arrivalRate?: number;
    arrivalCount?: number;
    rampTo?: number;
  }>;
}

/** All data collected during the wizard */
export interface WizardData {
  /** Target URL */
  target?: string;
  /** Selected test type */
  testType?: TestType;
  /** Load profile (phases) */
  loadProfile?: LoadProfile;
  /** Scenario requests */
  requests?: ScenarioRequest[];
  /** Scenario name */
  scenarioName?: string;
  /** Whether to save as a named config */
  saveAsConfig?: string;
  /** Description for saved config */
  configDescription?: string;
}

/** The complete wizard state */
export interface WizardState {
  /** Current step in the wizard */
  currentStep: WizardStep;
  /** All collected data */
  data: WizardData;
  /** Validation errors for current step */
  errors: string[];
  /** Available options for current step (varies by step) */
  options: Record<string, unknown>;
  /** Whether the wizard is complete */
  isComplete: boolean;
}

/** Input for advancing the wizard */
export interface WizardStepInput {
  /** The action to take (e.g., field name to set) */
  action: string;
  /** The value for the action */
  value: unknown;
}

/** Result of wizard finalization */
export interface WizardFinalizeResult {
  /** The generated Artillery config as YAML string */
  configYaml: string;
  /** Summary of what was generated */
  summary: {
    target: string;
    testType: TestType;
    totalDuration: number;
    scenarioName: string;
    requestCount: number;
  };
}

// ============================================================================
// Test Type Presets
// ============================================================================

/** Preset configurations for different test types */
export const TEST_PRESETS: Record<TestType, { name: string; description: string; profile: LoadProfile }> = {
  smoke: {
    name: 'Smoke Test',
    description: 'Quick test with low volume to verify functionality (30s, 1 req/s)',
    profile: {
      phases: [
        { duration: 30, arrivalRate: 1 }
      ]
    }
  },
  baseline: {
    name: 'Baseline Test',
    description: 'Moderate load to establish performance metrics (2min, 10 req/s)',
    profile: {
      phases: [
        { duration: 30, arrivalRate: 5 },
        { duration: 60, arrivalRate: 10 },
        { duration: 30, arrivalRate: 5 }
      ]
    }
  },
  soak: {
    name: 'Soak Test',
    description: 'Extended steady load to find memory leaks (10min, 5 req/s)',
    profile: {
      phases: [
        { duration: 60, arrivalRate: 5 },
        { duration: 480, arrivalRate: 5 },
        { duration: 60, arrivalRate: 0 }
      ]
    }
  },
  spike: {
    name: 'Spike Test',
    description: 'Sudden traffic surge to test resilience (ramp to 50 req/s)',
    profile: {
      phases: [
        { duration: 30, arrivalRate: 5 },
        { duration: 10, arrivalRate: 5, rampTo: 50 },
        { duration: 30, arrivalRate: 50 },
        { duration: 30, arrivalRate: 5 }
      ]
    }
  },
  custom: {
    name: 'Custom Test',
    description: 'Define your own load profile',
    profile: {
      phases: [
        { duration: 60, arrivalRate: 10 }
      ]
    }
  }
};

// ============================================================================
// Wizard State Machine
// ============================================================================

/**
 * Create a fresh wizard state.
 * @param fromSavedConfig - Optional: start from a saved config's data
 */
export function createWizardState(fromSavedConfig?: WizardData): WizardState {
  return {
    currentStep: 'target',
    data: fromSavedConfig || {},
    errors: [],
    options: {
      placeholder: 'https://api.example.com',
      hint: 'Enter the base URL of the system you want to test'
    },
    isComplete: false
  };
}

/**
 * Advance the wizard to the next step based on user input.
 * This is a pure function - it returns a new state without mutating the input.
 */
export function advanceWizard(state: WizardState, input: WizardStepInput): WizardState {
  const newState: WizardState = {
    ...state,
    data: { ...state.data },
    errors: []
  };

  switch (state.currentStep) {
    case 'target':
      return handleTargetStep(newState, input);
    case 'test_type':
      return handleTestTypeStep(newState, input);
    case 'load_profile':
      return handleLoadProfileStep(newState, input);
    case 'scenarios':
      return handleScenariosStep(newState, input);
    case 'review':
      return handleReviewStep(newState, input);
    default:
      return { ...newState, errors: ['Wizard is already complete'] };
  }
}

function handleTargetStep(state: WizardState, input: WizardStepInput): WizardState {
  if (input.action === 'set_target') {
    const target = String(input.value).trim();
    
    // Validate URL
    if (!target) {
      return { ...state, errors: ['Target URL is required'] };
    }
    
    try {
      new URL(target);
    } catch {
      return { ...state, errors: ['Invalid URL format. Must include protocol (https:// or http://)'] };
    }

    return {
      ...state,
      data: { ...state.data, target },
      currentStep: 'test_type',
      options: {
        testTypes: Object.entries(TEST_PRESETS).map(([key, preset]) => ({
          id: key,
          name: preset.name,
          description: preset.description
        })),
        hint: 'Select a test type or choose "custom" to define your own load profile'
      }
    };
  }

  return { ...state, errors: ['Unknown action. Use "set_target" with a URL value.'] };
}

function handleTestTypeStep(state: WizardState, input: WizardStepInput): WizardState {
  if (input.action === 'set_test_type') {
    const testType = String(input.value) as TestType;
    
    if (!TEST_PRESETS[testType]) {
      return { ...state, errors: [`Invalid test type. Choose from: ${Object.keys(TEST_PRESETS).join(', ')}`] };
    }

    const preset = TEST_PRESETS[testType];
    
    // For custom, go to load_profile step to let user define it
    if (testType === 'custom') {
      return {
        ...state,
        data: { ...state.data, testType, loadProfile: preset.profile },
        currentStep: 'load_profile',
        options: {
          currentProfile: preset.profile,
          hint: 'Define your load profile phases. Each phase has duration (seconds) and arrivalRate (requests/second)',
          example: {
            phases: [
              { duration: 60, arrivalRate: 10 },
              { duration: 120, arrivalRate: 20 },
              { duration: 60, arrivalRate: 5 }
            ]
          }
        }
      };
    }

    // For presets, apply the preset and skip to scenarios
    return {
      ...state,
      data: { ...state.data, testType, loadProfile: preset.profile },
      currentStep: 'scenarios',
      options: {
        hint: 'Define the HTTP requests to make during the test',
        example: {
          requests: [
            { method: 'GET', url: '/api/health' },
            { method: 'GET', url: '/api/users' },
            { method: 'POST', url: '/api/data', body: { key: 'value' } }
          ]
        }
      }
    };
  }

  return { ...state, errors: ['Unknown action. Use "set_test_type" with a test type value.'] };
}

function handleLoadProfileStep(state: WizardState, input: WizardStepInput): WizardState {
  if (input.action === 'set_load_profile') {
    const profile = input.value as LoadProfile;
    
    // Validate phases
    if (!profile?.phases || !Array.isArray(profile.phases) || profile.phases.length === 0) {
      return { ...state, errors: ['Load profile must have at least one phase'] };
    }

    for (const phase of profile.phases) {
      if (typeof phase.duration !== 'number' || phase.duration <= 0) {
        return { ...state, errors: ['Each phase must have a positive duration (seconds)'] };
      }
      if (phase.arrivalRate !== undefined && phase.arrivalRate < 0) {
        return { ...state, errors: ['arrivalRate cannot be negative'] };
      }
    }

    // Safety check: warn about aggressive load profiles
    const maxRate = Math.max(...profile.phases.map(p => p.arrivalRate || p.rampTo || 0));
    const totalDuration = profile.phases.reduce((sum, p) => sum + p.duration, 0);
    
    if (maxRate > 100) {
      return { ...state, errors: ['Warning: arrivalRate > 100 req/s is very high. Please confirm this is intentional.'] };
    }
    if (totalDuration > 3600) {
      return { ...state, errors: ['Warning: total duration > 1 hour is very long. Please confirm this is intentional.'] };
    }

    return {
      ...state,
      data: { ...state.data, loadProfile: profile },
      currentStep: 'scenarios',
      options: {
        hint: 'Define the HTTP requests to make during the test',
        example: {
          requests: [
            { method: 'GET', url: '/api/health' },
            { method: 'GET', url: '/api/users' }
          ]
        }
      }
    };
  }

  if (input.action === 'confirm_aggressive') {
    // User confirmed aggressive load profile, proceed
    return {
      ...state,
      currentStep: 'scenarios',
      options: {
        hint: 'Define the HTTP requests to make during the test',
        example: {
          requests: [
            { method: 'GET', url: '/api/health' }
          ]
        }
      }
    };
  }

  return { ...state, errors: ['Unknown action. Use "set_load_profile" with a phases array.'] };
}

function handleScenariosStep(state: WizardState, input: WizardStepInput): WizardState {
  if (input.action === 'set_scenarios') {
    const { requests, scenarioName } = input.value as { requests: ScenarioRequest[]; scenarioName?: string };
    
    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      return { ...state, errors: ['At least one request is required'] };
    }

    // Validate requests
    const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    for (const req of requests) {
      if (!validMethods.includes(req.method)) {
        return { ...state, errors: [`Invalid HTTP method: ${req.method}. Use: ${validMethods.join(', ')}`] };
      }
      if (!req.url || typeof req.url !== 'string') {
        return { ...state, errors: ['Each request must have a URL path'] };
      }
    }

    return {
      ...state,
      data: { 
        ...state.data, 
        requests, 
        scenarioName: scenarioName || 'Generated Test' 
      },
      currentStep: 'review',
      options: {
        hint: 'Review your configuration before generating',
        summary: generateSummary({ ...state.data, requests, scenarioName }),
        actions: ['generate', 'save_and_generate', 'back']
      }
    };
  }

  return { ...state, errors: ['Unknown action. Use "set_scenarios" with requests array.'] };
}

function handleReviewStep(state: WizardState, input: WizardStepInput): WizardState {
  if (input.action === 'go_back') {
    // Allow going back to previous step
    return {
      ...state,
      currentStep: 'scenarios'
    };
  }

  if (input.action === 'confirm') {
    return {
      ...state,
      currentStep: 'complete',
      isComplete: true
    };
  }

  if (input.action === 'save_as') {
    const { configName, description } = input.value as { configName: string; description?: string };
    return {
      ...state,
      data: { 
        ...state.data, 
        saveAsConfig: configName,
        configDescription: description
      },
      currentStep: 'complete',
      isComplete: true
    };
  }

  return { ...state, errors: ['Unknown action. Use "confirm" to generate, or "save_as" to save.'] };
}

function generateSummary(data: WizardData): Record<string, unknown> {
  const totalDuration = data.loadProfile?.phases.reduce((sum, p) => sum + p.duration, 0) || 0;
  const maxRate = Math.max(...(data.loadProfile?.phases.map(p => p.arrivalRate || p.rampTo || 0) || [0]));
  
  return {
    target: data.target,
    testType: data.testType,
    totalDuration: `${totalDuration}s`,
    maxArrivalRate: `${maxRate} req/s`,
    scenarioName: data.scenarioName || 'Generated Test',
    requestCount: data.requests?.length || 0,
    requests: data.requests?.map(r => `${r.method} ${r.url}`)
  };
}

/**
 * Generate final Artillery YAML config from completed wizard state.
 */
export function generateConfig(state: WizardState): WizardFinalizeResult {
  if (!state.isComplete) {
    throw new Error('Wizard is not complete. Cannot generate config.');
  }

  const { data } = state;
  
  if (!data.target || !data.loadProfile || !data.requests) {
    throw new Error('Missing required wizard data');
  }

  // Build phases with Artillery 2.0 format
  const phases = data.loadProfile.phases.map(phase => {
    const p: Record<string, number> = { duration: phase.duration };
    if (phase.arrivalRate !== undefined) p.arrivalRate = phase.arrivalRate;
    if (phase.arrivalCount !== undefined) p.arrivalCount = phase.arrivalCount;
    if (phase.rampTo !== undefined) p.rampTo = phase.rampTo;
    return p;
  });

  // Build scenario flow
  const flow = data.requests.map(req => {
    const step: Record<string, unknown> = {};
    const reqConfig: Record<string, unknown> = { url: req.url };
    if (req.body) reqConfig.json = req.body;
    if (req.headers) reqConfig.headers = req.headers;
    step[req.method.toLowerCase()] = reqConfig;
    return step;
  });

  // Generate YAML manually (to avoid yaml dependency)
  const yaml = generateYaml(data.target, phases, data.scenarioName || 'Generated Test', flow);

  return {
    configYaml: yaml,
    summary: {
      target: data.target,
      testType: data.testType || 'custom',
      totalDuration: phases.reduce((sum, p) => sum + p.duration, 0),
      scenarioName: data.scenarioName || 'Generated Test',
      requestCount: data.requests.length
    }
  };
}

function generateYaml(
  target: string, 
  phases: Record<string, number>[], 
  scenarioName: string,
  flow: Record<string, unknown>[]
): string {
  const lines: string[] = [
    '# Generated by Artillery MCP Server Wizard',
    'config:',
    `  target: '${target}'`,
    '  phases:'
  ];

  for (const phase of phases) {
    lines.push('    - duration: ' + phase.duration);
    if (phase.arrivalRate !== undefined) lines.push('      arrivalRate: ' + phase.arrivalRate);
    if (phase.arrivalCount !== undefined) lines.push('      arrivalCount: ' + phase.arrivalCount);
    if (phase.rampTo !== undefined) lines.push('      rampTo: ' + phase.rampTo);
  }

  lines.push('  defaults:');
  lines.push('    headers:');
  lines.push("      User-Agent: 'Artillery-MCP-Server/1.0.4'");
  lines.push('');
  lines.push('scenarios:');
  lines.push(`  - name: '${scenarioName}'`);
  lines.push('    flow:');

  for (const step of flow) {
    const method = Object.keys(step)[0];
    const config = step[method] as Record<string, unknown>;
    lines.push(`      - ${method}:`);
    lines.push(`          url: '${config.url}'`);
    if (config.json) {
      lines.push('          json:');
      const jsonLines = JSON.stringify(config.json, null, 2).split('\n');
      for (let i = 0; i < jsonLines.length; i++) {
        if (i === 0) continue; // Skip opening brace
        if (i === jsonLines.length - 1) continue; // Skip closing brace
        lines.push('            ' + jsonLines[i].trim());
      }
    }
    if (config.headers) {
      lines.push('          headers:');
      for (const [k, v] of Object.entries(config.headers as Record<string, string>)) {
        lines.push(`            ${k}: '${v}'`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Get current step information for display.
 */
export function getStepInfo(step: WizardStep): { title: string; description: string; stepNumber: number } {
  const info: Record<WizardStep, { title: string; description: string; stepNumber: number }> = {
    target: {
      title: 'Target URL',
      description: 'Enter the base URL of the system you want to test',
      stepNumber: 1
    },
    test_type: {
      title: 'Test Type',
      description: 'Choose a test type preset or select custom to define your own',
      stepNumber: 2
    },
    load_profile: {
      title: 'Load Profile',
      description: 'Configure the load phases for your test',
      stepNumber: 3
    },
    scenarios: {
      title: 'Scenarios',
      description: 'Define the HTTP requests to make during the test',
      stepNumber: 4
    },
    review: {
      title: 'Review & Generate',
      description: 'Review your configuration and generate the test',
      stepNumber: 5
    },
    complete: {
      title: 'Complete',
      description: 'Your configuration has been generated',
      stepNumber: 6
    }
  };

  return info[step];
}




