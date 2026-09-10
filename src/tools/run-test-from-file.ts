import { MCPTool, RunTestFromFileInput, ToolOutput, ArtilleryResult } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';

export class RunTestFromFileTool implements MCPTool {
  readonly name = 'run_test_from_file';
  readonly description = 'Run an Artillery test from a config file path.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to Artillery config, relative to the working directory' },
      outputJson: { type: 'string', description: 'Optional path to write JSON results' },
      reportHtml: { type: 'string', description: 'Optional path to write HTML report (requires an Artillery version that still supports reports)' },
      env: { type: 'object', additionalProperties: { type: 'string' } },
      cwd: { type: 'string', description: 'Working directory for the run, inside the server working directory' },
      validateOnly: { type: 'boolean', default: false }
    },
    required: ['path']
  };

  constructor(private artillery: ArtilleryWrapper) {}

  async call(request: any): Promise<ToolOutput<ArtilleryResult>> {
    const args = request.params?.arguments || request.params || {};
    try {
      const input: RunTestFromFileInput = {
        path: args.path,
        outputJson: args.outputJson,
        reportHtml: args.reportHtml,
        env: args.env,
        cwd: args.cwd,
        validateOnly: args.validateOnly || false
      };

      if (input.validateOnly) {
        return {
          status: 'ok',
          tool: this.name,
          data: { exitCode: 0, elapsedMs: 0, logsTail: 'Dry run requested: nothing was executed. Artillery has no validation mode, so the config has not been checked.', summary: undefined }
        };
      }

      const result = await this.artillery.runTestFromFile(input.path, {
        outputJson: input.outputJson,
        reportHtml: input.reportHtml,
        env: input.env,
        cwd: input.cwd
      });

      return { status: 'ok', tool: this.name, data: result };
    } catch (error) {
      return {
        status: 'error',
        tool: this.name,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: { tool: this.name, arguments: args }
        }
      };
    }
  }
}
