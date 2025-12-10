/**
 * MCP Tool: wizard_step
 * 
 * Advances the wizard to the next step based on user input.
 */

import { MCPTool, ToolOutput } from '../types.js';
import { 
  advanceWizard, 
  getStepInfo, 
  WizardState, 
  WizardStepInput,
  TEST_PRESETS 
} from '../lib/wizard.js';

/** Result of advancing wizard */
export interface WizardStepResult {
  /** The updated wizard state (pass this to next wizard_step call) */
  state: WizardState;
  /** Information about the current step */
  stepInfo: {
    title: string;
    description: string;
    stepNumber: number;
  };
  /** Instructions for the next action (if not complete) */
  nextAction?: {
    description: string;
    availableActions?: string[];
    example?: Record<string, unknown>;
  };
}

export class WizardStepTool implements MCPTool {
  readonly name = 'wizard_step';
  readonly description = 'Advance the wizard to the next step based on user input.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      state: {
        type: 'object',
        description: 'The current wizard state (from wizard_start or previous wizard_step)'
      },
      action: {
        type: 'string',
        description: 'The action to perform (e.g., "set_target", "set_test_type")'
      },
      value: {
        description: 'The value for the action (type depends on action)'
      }
    },
    required: ['state', 'action', 'value']
  };

  async call(request: unknown): Promise<ToolOutput<WizardStepResult>> {
    try {
      // Extract arguments from MCP request
      const req = request as { params?: { arguments?: { state?: WizardState; action?: string; value?: unknown } } };
      const args = req.params?.arguments || (request as { state?: WizardState; action?: string; value?: unknown });

      // Validate required fields
      if (!args.state || typeof args.state !== 'object') {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'state is required and must be the wizard state object'
          }
        };
      }

      if (!args.action || typeof args.action !== 'string') {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'action is required and must be a string'
          }
        };
      }

      // Handle case where value might be a JSON string instead of object
      let parsedValue = args.value;
      if (typeof args.value === 'string') {
        try {
          parsedValue = JSON.parse(args.value);
        } catch {
          // Not JSON, keep as string
        }
      }

      // Advance the wizard
      const input: WizardStepInput = {
        action: args.action,
        value: parsedValue
      };

      const newState = advanceWizard(args.state, input);
      const stepInfo = getStepInfo(newState.currentStep);

      // If there are errors, return them
      if (newState.errors.length > 0) {
        return {
          status: 'ok',
          tool: this.name,
          data: {
            state: newState,
            stepInfo,
            nextAction: {
              description: `Error: ${newState.errors.join('; ')}. Please try again.`,
              availableActions: getAvailableActions(newState.currentStep)
            }
          }
        };
      }

      // Build next action guidance
      const nextAction = buildNextActionGuidance(newState);

      return {
        status: 'ok',
        tool: this.name,
        data: {
          state: newState,
          stepInfo,
          nextAction
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

function getAvailableActions(step: string): string[] {
  switch (step) {
    case 'target':
      return ['set_target'];
    case 'test_type':
      return ['set_test_type'];
    case 'load_profile':
      return ['set_load_profile', 'confirm_aggressive'];
    case 'scenarios':
      return ['set_scenarios'];
    case 'review':
      return ['confirm', 'save_as', 'go_back'];
    default:
      return [];
  }
}

function buildNextActionGuidance(state: WizardState): WizardStepResult['nextAction'] {
  if (state.isComplete) {
    return {
      description: 'Wizard complete! Call wizard_finalize with this state to generate the config.',
      example: {
        state: '<pass the state object>',
        runImmediately: false
      }
    };
  }

  switch (state.currentStep) {
    case 'target':
      return {
        description: 'Enter the target URL for your test',
        availableActions: ['set_target'],
        example: {
          action: 'set_target',
          value: 'https://api.example.com'
        }
      };

    case 'test_type':
      return {
        description: 'Choose a test type preset or "custom" to define your own',
        availableActions: ['set_test_type'],
        example: {
          action: 'set_test_type',
          value: 'smoke',
          availableTypes: Object.entries(TEST_PRESETS).map(([k, v]) => ({
            id: k,
            name: v.name,
            description: v.description
          }))
        }
      };

    case 'load_profile':
      return {
        description: 'Define your custom load profile phases',
        availableActions: ['set_load_profile'],
        example: {
          action: 'set_load_profile',
          value: {
            phases: [
              { duration: 30, arrivalRate: 5 },
              { duration: 60, arrivalRate: 10 },
              { duration: 30, arrivalRate: 5 }
            ]
          }
        }
      };

    case 'scenarios':
      return {
        description: 'Define the HTTP requests for your test scenario',
        availableActions: ['set_scenarios'],
        example: {
          action: 'set_scenarios',
          value: {
            requests: [
              { method: 'GET', url: '/api/health' },
              { method: 'POST', url: '/api/data', body: { key: 'value' } }
            ],
            scenarioName: 'API Test'
          }
        }
      };

    case 'review':
      return {
        description: 'Review your configuration and confirm or go back',
        availableActions: ['confirm', 'save_as', 'go_back'],
        example: {
          action: 'confirm',
          value: true,
          alternatives: [
            { action: 'save_as', value: { configName: 'my-test', description: 'My test config' } },
            { action: 'go_back', value: null }
          ]
        }
      };

    default:
      return {
        description: 'Unknown step',
        availableActions: []
      };
  }
}



