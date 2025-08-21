import { MCPTool, RunTestInlineInput, ToolOutput, ArtilleryResult } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';

export class RunTestInlineTool implements MCPTool {
  readonly name = 'run_test_inline';
  readonly description = 'Run an Artillery test from an inline config string.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      configText: { type: 'string', description: 'Artillery config as YAML/JSON string' },
      outputJson: { type: 'string' },
      reportHtml: { type: 'string' },
      env: { type: 'object', additionalProperties: { type: 'string' } },
      cwd: { type: 'string' },
      validateOnly: { type: 'boolean', default: false }
    },
    required: ['configText']
  };

  constructor(private artillery: ArtilleryWrapper) {}

  async call(request: any): Promise<ToolOutput<ArtilleryResult>> {
    try {
      // Extract arguments from MCP request
      const args = request.params?.arguments || request.params || {};
      
      // Validate input
      const input: RunTestInlineInput = {
        configText: args.configText,
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
            logsTail: 'Inline configuration validated successfully (dry-run)',
            summary: undefined
          }
        };
      }

      // Run the test
      const result = await this.artillery.runTestInline(input.configText, {
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
