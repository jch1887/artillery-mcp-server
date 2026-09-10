import { MCPTool, QuickTestInput, QuickTestResult, ToolOutput } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';

export class QuickTestTool implements MCPTool {
  readonly name = 'quick_test';
  readonly description = 'Run a quick HTTP load test against a single URL without writing a config.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'URL to test' },
      rate: { type: 'number', minimum: 1, description: 'Requests per second (ignored when count is set)' },
      duration: { type: 'string', description: 'Test duration, e.g. "30s" or "1m"' },
      count: { type: 'number', minimum: 1, description: 'Total number of requests to send' },
      method: { type: 'string', default: 'GET' },
      headers: { type: 'object', additionalProperties: { type: 'string' } },
      body: { type: 'string' },
      insecure: { type: 'boolean', default: false, description: 'Skip TLS certificate verification' },
      keepResults: { type: 'boolean', default: false, description: 'Keep the JSON results file' },
      outputJson: { type: 'string', description: 'Path for JSON results (inside the working directory)' }
    },
    required: ['target']
  };

  constructor(private artillery: ArtilleryWrapper) {}

  async call(request: any): Promise<ToolOutput<QuickTestResult>> {
    const args = request.params?.arguments || request.params || {};
    try {
      const input: QuickTestInput = {
        target: args.target,
        rate: args.rate,
        duration: args.duration,
        count: args.count,
        method: args.method,
        headers: args.headers,
        body: args.body,
        insecure: args.insecure,
        keepResults: args.keepResults,
        outputJson: args.outputJson
      };
      const result = await this.artillery.quickTest(input);
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
