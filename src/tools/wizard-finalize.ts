/**
 * MCP Tool: wizard_finalize
 * 
 * Generates the final Artillery config from a completed wizard state.
 * Optionally saves it and/or runs it immediately.
 */

import { MCPTool, ToolOutput, ArtilleryResult } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';
import { ConfigStorage } from '../lib/config-storage.js';
import { generateConfig, WizardState, WizardFinalizeResult } from '../lib/wizard.js';

/** Result of finalizing wizard */
export interface WizardFinalizeOutput {
  /** The generated configuration */
  config: WizardFinalizeResult;
  /** If saved, the saved config name */
  savedAs?: string;
  /** If run, the test results */
  testResult?: ArtilleryResult;
}

export class WizardFinalizeTool implements MCPTool {
  readonly name = 'wizard_finalize';
  readonly description = 'Generate the final Artillery config from a completed wizard. Optionally save and/or run it.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      state: {
        type: 'object',
        description: 'The completed wizard state'
      },
      runImmediately: {
        type: 'boolean',
        description: 'If true, run the test immediately after generating'
      },
      outputJson: {
        type: 'string',
        description: 'Path for JSON results output (if running)'
      },
      reportHtml: {
        type: 'string',
        description: 'Path for HTML report output (if running)'
      }
    },
    required: ['state']
  };

  constructor(
    private artillery: ArtilleryWrapper,
    private configStorage: ConfigStorage
  ) {}

  async call(request: unknown): Promise<ToolOutput<WizardFinalizeOutput>> {
    try {
      // Extract arguments from MCP request
      const req = request as { 
        params?: { 
          arguments?: { 
            state?: WizardState;
            runImmediately?: boolean;
            outputJson?: string;
            reportHtml?: string;
          } 
        } 
      };
      const args = req.params?.arguments || (request as { 
        state?: WizardState;
        runImmediately?: boolean;
        outputJson?: string;
        reportHtml?: string;
      });

      // Validate state
      if (!args.state || typeof args.state !== 'object') {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'state is required and must be the completed wizard state'
          }
        };
      }

      if (!args.state.isComplete) {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Wizard is not complete. Continue using wizard_step until complete.'
          }
        };
      }

      // Generate config
      const config = generateConfig(args.state);
      
      const result: WizardFinalizeOutput = { config };

      // Save if requested
      if (args.state.data.saveAsConfig) {
        await this.configStorage.save({
          name: args.state.data.saveAsConfig,
          content: config.configYaml,
          description: args.state.data.configDescription,
          tags: ['wizard-generated']
        });
        result.savedAs = args.state.data.saveAsConfig;
      }

      // Run if requested
      if (args.runImmediately) {
        const testResult = await this.artillery.runTestInline(config.configYaml, {
          outputJson: args.outputJson,
          reportHtml: args.reportHtml
        });
        result.testResult = testResult;
      }

      return {
        status: 'ok',
        tool: this.name,
        data: result
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




