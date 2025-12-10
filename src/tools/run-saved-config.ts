/**
 * MCP Tool: run_saved_config
 * 
 * Runs an Artillery test using a previously saved configuration.
 */

import { MCPTool, ToolOutput, ArtilleryResult } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';
import { ConfigStorage } from '../lib/config-storage.js';

/** Input parameters for run_saved_config tool */
export interface RunSavedConfigInput {
  /** Name of the saved config to run */
  name: string;
  /** Optional path for JSON results output */
  outputJson?: string;
  /** Optional path for HTML report output */
  reportHtml?: string;
  /** Optional environment variables */
  env?: Record<string, string>;
  /** If true, only validate the config without running */
  validateOnly?: boolean;
}

export class RunSavedConfigTool implements MCPTool {
  readonly name = 'run_saved_config';
  readonly description = 'Run an Artillery test using a previously saved configuration.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      name: { 
        type: 'string', 
        description: 'Name of the saved config to run' 
      },
      outputJson: { 
        type: 'string', 
        description: 'Optional path for JSON results output' 
      },
      reportHtml: { 
        type: 'string', 
        description: 'Optional path for HTML report output' 
      },
      env: { 
        type: 'object', 
        additionalProperties: { type: 'string' },
        description: 'Optional environment variables to pass to Artillery'
      },
      validateOnly: { 
        type: 'boolean', 
        default: false,
        description: 'If true, only validate the config without running'
      }
    },
    required: ['name']
  };

  constructor(
    private artillery: ArtilleryWrapper,
    private storage: ConfigStorage
  ) {}

  async call(request: unknown): Promise<ToolOutput<ArtilleryResult>> {
    try {
      // Extract arguments from MCP request
      const req = request as { params?: { arguments?: RunSavedConfigInput } };
      const args = req.params?.arguments || (request as RunSavedConfigInput);

      // Validate required field
      if (!args.name || typeof args.name !== 'string') {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'name is required and must be a string'
          }
        };
      }

      // Get the config path
      const configPath = await this.storage.getConfigPath(args.name);

      // Handle dry-run validation
      if (args.validateOnly) {
        return {
          status: 'ok',
          tool: this.name,
          data: {
            exitCode: 0,
            elapsedMs: 0,
            logsTail: `Saved config '${args.name}' validated successfully (dry-run)`,
            summary: undefined
          }
        };
      }

      // Run the test using the saved config file
      const result = await this.artillery.runTestFromFile(configPath, {
        outputJson: args.outputJson,
        reportHtml: args.reportHtml,
        env: args.env
      });

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




