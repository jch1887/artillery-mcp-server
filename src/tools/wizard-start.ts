/**
 * MCP Tool: wizard_start
 * 
 * Starts a new interactive wizard session for building Artillery tests.
 */

import { MCPTool, ToolOutput } from '../types.js';
import { ConfigStorage } from '../lib/config-storage.js';
import { createWizardState, getStepInfo, WizardState, WizardData } from '../lib/wizard.js';

/** Result of starting a wizard */
export interface WizardStartResult {
  /** The initial wizard state (pass this to wizard_step) */
  state: WizardState;
  /** Information about the current step */
  stepInfo: {
    title: string;
    description: string;
    stepNumber: number;
  };
  /** Instructions for the next action */
  nextAction: {
    description: string;
    example: Record<string, unknown>;
  };
}

export class WizardStartTool implements MCPTool {
  readonly name = 'wizard_start';
  readonly description = 'Start a new interactive wizard for building Artillery test configurations.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      fromSavedConfig: {
        type: 'string',
        description: 'Optional: name of a saved config to use as starting point'
      }
    }
  };

  constructor(private configStorage: ConfigStorage) {}

  async call(request: unknown): Promise<ToolOutput<WizardStartResult>> {
    try {
      // Extract arguments from MCP request
      const req = request as { params?: { arguments?: { fromSavedConfig?: string } } };
      const args = req.params?.arguments || (request as { fromSavedConfig?: string });

      let initialData: WizardData | undefined;

      // If starting from a saved config, load it
      if (args.fromSavedConfig) {
        try {
          const { content } = await this.configStorage.get(args.fromSavedConfig);
          // Parse the saved config to extract data
          // For simplicity, we'll just note that we're starting from a saved config
          // In a full implementation, you'd parse the YAML to extract target, etc.
          initialData = {
            // Basic parsing - extract target if present
            target: extractTargetFromYaml(content)
          };
        } catch (error) {
          return {
            status: 'error',
            tool: this.name,
            error: {
              code: 'EXECUTION_ERROR',
              message: `Failed to load saved config: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          };
        }
      }

      // Create wizard state
      const state = createWizardState(initialData);
      const stepInfo = getStepInfo(state.currentStep);

      return {
        status: 'ok',
        tool: this.name,
        data: {
          state,
          stepInfo,
          nextAction: {
            description: 'Call wizard_step with action "set_target" and your target URL',
            example: {
              state: '<pass the state object from this response>',
              action: 'set_target',
              value: 'https://api.example.com'
            }
          }
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

/**
 * Simple helper to extract target URL from YAML config.
 */
function extractTargetFromYaml(yaml: string): string | undefined {
  const match = yaml.match(/target:\s*['"]?([^'"\\n]+)['"]?/);
  return match ? match[1].trim() : undefined;
}




