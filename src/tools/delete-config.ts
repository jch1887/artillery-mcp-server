/**
 * MCP Tool: delete_config
 * 
 * Deletes a saved Artillery configuration.
 */

import { MCPTool, ToolOutput } from '../types.js';
import { ConfigStorage } from '../lib/config-storage.js';

/** Result of delete operation */
export interface DeleteConfigResult {
  /** Whether the config was deleted */
  deleted: boolean;
  /** Name of the config that was deleted (or attempted) */
  name: string;
}

export class DeleteConfigTool implements MCPTool {
  readonly name = 'delete_config';
  readonly description = 'Delete a saved Artillery configuration.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      name: { 
        type: 'string', 
        description: 'Name of the config to delete' 
      }
    },
    required: ['name']
  };

  constructor(private storage: ConfigStorage) {}

  async call(request: unknown): Promise<ToolOutput<DeleteConfigResult>> {
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

      // Delete the config
      const deleted = await this.storage.delete(args.name);

      return {
        status: 'ok',
        tool: this.name,
        data: {
          deleted,
          name: args.name
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




