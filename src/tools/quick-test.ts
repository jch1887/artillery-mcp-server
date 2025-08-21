import { MCPTool, QuickTestInput, ToolOutput, ArtilleryResult } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';

export class QuickTestTool implements MCPTool {
  readonly name = 'quick_test';
  readonly description = 'Run a quick HTTP test (if supported by Artillery).';
  readonly inputSchema = {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'URL to test' },
      rate: { type: 'number', minimum: 1 },
      duration: { type: 'string', description: 'e.g., "1m"' },
      count: { type: 'number', minimum: 1 },
      method: { type: 'string', default: 'GET' },
      headers: { type: 'object', additionalProperties: { type: 'string' } },
      body: { type: 'string' }
    },
    required: ['target']
  };

  constructor(private artillery: ArtilleryWrapper) {}

  async call(request: any): Promise<ToolOutput<ArtilleryResult>> {
    try {
      // Extract arguments from MCP request
      const args = request.params?.arguments || request.params || {};
      
      // Validate input
      const input: QuickTestInput = {
        target: args.target,
        rate: args.rate,
        duration: args.duration,
        count: args.count,
        method: args.method,
        headers: args.headers,
        body: args.body
      };

      // Run the quick test
      const result = await this.artillery.quickTest(input);

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
          details: {
            tool: this.name,
            arguments: request.params?.arguments || request.params
          }
        }
      };
    }
  }
}
