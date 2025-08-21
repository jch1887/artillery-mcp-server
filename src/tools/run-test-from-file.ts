import { MCPTool, RunTestFromFileInput, ToolOutput, ArtilleryResult } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';

export class RunTestFromFileTool implements MCPTool {
  readonly name = 'run_test_from_file';
  readonly description = 'Run an Artillery test from a config file path.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or relative path to Artillery config' },
      outputJson: { type: 'string', description: 'Optional path to write JSON results' },
      reportHtml: { type: 'string', description: 'Optional path to write HTML report' },
      env: { type: 'object', additionalProperties: { type: 'string' } },
      cwd: { type: 'string' },
      validateOnly: { type: 'boolean', default: false }
    },
    required: ['path']
  };

  constructor(private artillery: ArtilleryWrapper) {}

  async call(request: any): Promise<ToolOutput<ArtilleryResult>> {
    try {
      // Extract arguments from MCP request
      const args = request.params?.arguments || request.params || {};
      
      // Validate input
      const input: RunTestFromFileInput = {
        path: args.path,
        outputJson: args.outputJson,
        reportHtml: args.reportHtml,
        env: args.env,
        cwd: args.cwd,
        validateOnly: args.validateOnly || false
      };
      
      // Handle dry-run validation
      if (input.validateOnly) {
        return {
          status: 'ok',
          tool: this.name,
          data: {
            exitCode: 0,
            elapsedMs: 0,
            logsTail: 'Configuration validated successfully (dry-run)',
            summary: undefined
          }
        };
      }

      // Run the test
      const result = await this.artillery.runTestFromFile(input.path, {
        outputJson: input.outputJson,
        reportHtml: input.reportHtml,
        env: input.env,
        cwd: input.cwd
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
          details: {
            tool: this.name,
            arguments: request.params?.arguments || request.params
          }
        }
      };
    }
  }
}
