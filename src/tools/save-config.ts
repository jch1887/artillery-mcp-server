/**
 * MCP Tool: save_config
 * 
 * Saves a new Artillery configuration or updates an existing one.
 */

import { MCPTool, ToolOutput } from '../types.js';
import { ConfigStorage, SavedConfigEntry } from '../lib/config-storage.js';

/** Input parameters for save_config tool */
export interface SaveConfigInput {
  /** Unique name for the config (will be sanitized) */
  name: string;
  /** Artillery configuration content (YAML or JSON string) */
  content: string;
  /** Optional description */
  description?: string;
  /** Optional tags for organization */
  tags?: string[];
}

export class SaveConfigTool implements MCPTool {
  readonly name = 'save_config';
  readonly description = 'Save a new Artillery configuration or update an existing one.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      name: { 
        type: 'string', 
        description: 'Unique name for the config (alphanumeric, hyphens, underscores)' 
      },
      content: { 
        type: 'string', 
        description: 'Artillery configuration as YAML or JSON string' 
      },
      description: { 
        type: 'string', 
        description: 'Optional description of what this config tests' 
      },
      tags: { 
        type: 'array', 
        items: { type: 'string' },
        description: 'Optional tags for organization (e.g., ["smoke", "api"])' 
      }
    },
    required: ['name', 'content']
  };

  constructor(private storage: ConfigStorage) {}

  async call(request: unknown): Promise<ToolOutput<SavedConfigEntry>> {
    try {
      // Extract arguments from MCP request
      const req = request as { params?: { arguments?: SaveConfigInput } };
      const args = req.params?.arguments || (request as SaveConfigInput);

      // Validate required fields
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

      if (!args.content || typeof args.content !== 'string') {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'content is required and must be a string'
          }
        };
      }

      // Save the config
      const entry = await this.storage.save({
        name: args.name,
        content: args.content,
        description: args.description,
        tags: args.tags
      });

      return {
        status: 'ok',
        tool: this.name,
        data: entry
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




