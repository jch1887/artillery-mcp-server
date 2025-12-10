/**
 * MCP Tool: run_preset_test
 * 
 * Run a preset test type (smoke, baseline, soak, spike) with minimal configuration.
 * This is a convenience wrapper that generates a config and runs it immediately.
 */

import { MCPTool, ToolOutput, ArtilleryResult } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';
import { TEST_PRESETS, TestType, generateConfig, createWizardState, advanceWizard } from '../lib/wizard.js';

/** Input for preset test */
export interface RunPresetTestInput {
  /** Target URL to test */
  target: string;
  /** Test type preset */
  preset: TestType;
  /** Optional path for specific endpoint (default: /) */
  path?: string;
  /** Optional HTTP method (default: GET) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Optional request body for POST/PUT */
  body?: Record<string, unknown>;
  /** Optional path for JSON results output */
  outputJson?: string;
  /** Optional path for HTML report output */
  reportHtml?: string;
  /** Optional environment variables */
  env?: Record<string, string>;
}

/** Extended result with preset info */
export interface PresetTestResult extends ArtilleryResult {
  preset: {
    name: string;
    description: string;
    type: TestType;
  };
  configYaml: string;
}

export class RunPresetTestTool implements MCPTool {
  readonly name = 'run_preset_test';
  readonly description = 'Run a preset test type (smoke, baseline, soak, spike) with minimal configuration.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'Target URL to test (e.g., https://api.example.com)'
      },
      preset: {
        type: 'string',
        enum: ['smoke', 'baseline', 'soak', 'spike'],
        description: 'Test type preset: smoke (30s), baseline (2min), soak (10min), spike (100s)'
      },
      path: {
        type: 'string',
        description: 'Optional endpoint path (default: /)'
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP method (default: GET)'
      },
      body: {
        type: 'object',
        description: 'Optional request body for POST/PUT'
      },
      outputJson: {
        type: 'string',
        description: 'Path for JSON results output'
      },
      reportHtml: {
        type: 'string',
        description: 'Path for HTML report output'
      },
      env: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Environment variables to pass to Artillery'
      }
    },
    required: ['target', 'preset']
  };

  constructor(private artillery: ArtilleryWrapper) {}

  async call(request: unknown): Promise<ToolOutput<PresetTestResult>> {
    try {
      // Extract arguments
      const req = request as { params?: { arguments?: RunPresetTestInput } };
      const args = req.params?.arguments || (request as RunPresetTestInput);

      // Validate required fields
      if (!args.target || typeof args.target !== 'string') {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'target is required and must be a URL'
          }
        };
      }

      if (!args.preset || !TEST_PRESETS[args.preset]) {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: `preset must be one of: ${Object.keys(TEST_PRESETS).filter(k => k !== 'custom').join(', ')}`
          }
        };
      }

      // Validate URL
      try {
        new URL(args.target);
      } catch {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid target URL format'
          }
        };
      }

      // Build config using wizard state machine
      let state = createWizardState();
      state = advanceWizard(state, { action: 'set_target', value: args.target });
      state = advanceWizard(state, { action: 'set_test_type', value: args.preset });
      
      const path = args.path || '/';
      const method = args.method || 'GET';
      const requests = [{
        method: method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
        url: path,
        ...(args.body ? { body: args.body } : {})
      }];

      state = advanceWizard(state, {
        action: 'set_scenarios',
        value: {
          requests,
          scenarioName: `${TEST_PRESETS[args.preset].name}`
        }
      });

      state = advanceWizard(state, { action: 'confirm', value: true });

      // Generate config
      const { configYaml, summary } = generateConfig(state);

      // Run the test
      const result = await this.artillery.runTestInline(configYaml, {
        outputJson: args.outputJson,
        reportHtml: args.reportHtml,
        env: args.env
      });

      return {
        status: 'ok',
        tool: this.name,
        data: {
          ...result,
          preset: {
            name: TEST_PRESETS[args.preset].name,
            description: TEST_PRESETS[args.preset].description,
            type: args.preset
          },
          configYaml
        }
      };

    } catch (error) {
      return {
        status: 'error',
        tool: this.name,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: { tool: this.name }
        }
      };
    }
  }
}




