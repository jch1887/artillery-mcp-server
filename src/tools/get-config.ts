/**
 * MCP Tool: get_config
 * 
 * Retrieves a saved Artillery configuration by name.
 */

import { MCPTool, ToolOutput } from '../types.js';
import { ConfigStorage, GetConfigResult } from '../lib/config-storage.js';

export class GetConfigTool implements MCPTool {
  readonly name = 'get_config';
  readonly description = 'Retrieve a saved Artillery configuration by name.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      name: { 
        type: 'string', 
        description: 'Name of the config to retrieve' 
      }
    },
    required: ['name']
  };

  constructor(private storage: ConfigStorage) {}

  async call(request: unknown): Promise<ToolOutput<GetConfigResult>> {
    try {
      // Extract arguments from MCP request
      const req = request as { params?: { arguments?: { name?: string } } };
      const args = req.params?.arguments || (request as { name?: string });

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

      // Get the config
      const result = await this.storage.get(args.name);

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




