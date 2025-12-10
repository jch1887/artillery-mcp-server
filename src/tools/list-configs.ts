/**
 * MCP Tool: list_configs
 * 
 * Lists all saved Artillery configurations with their metadata.
 */

import { MCPTool, ToolOutput } from '../types.js';
import { ConfigStorage, ListConfigsResult } from '../lib/config-storage.js';

export class ListConfigsTool implements MCPTool {
  readonly name = 'list_configs';
  readonly description = 'List all saved Artillery configurations.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      tag: {
        type: 'string',
        description: 'Optional tag to filter configs by'
      }
    }
  };

  constructor(private storage: ConfigStorage) {}

  async call(request: unknown): Promise<ToolOutput<ListConfigsResult>> {
    try {
      // Extract arguments from MCP request
      const req = request as { params?: { arguments?: { tag?: string } } };
      const args = req.params?.arguments || (request as { tag?: string });

      // Get all configs
      const result = await this.storage.list();

      // Filter by tag if specified
      if (args.tag && typeof args.tag === 'string') {
        const filteredConfigs = result.configs.filter(
          config => config.tags?.includes(args.tag!)
        );
        return {
          status: 'ok',
          tool: this.name,
          data: {
            count: filteredConfigs.length,
            configs: filteredConfigs
          }
        };
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




