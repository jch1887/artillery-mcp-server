import { MCPTool, ToolOutput, ParsedResults } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';
import { parseResultsDocument } from '../lib/results.js';

export class ParseResultsTool implements MCPTool {
  readonly name = 'parse_results';
  readonly description = 'Parse and summarize Artillery JSON results file.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      jsonPath: { type: 'string', description: 'Path to Artillery JSON results file (inside the working directory)' }
    },
    required: ['jsonPath']
  };

  constructor(private artillery: ArtilleryWrapper) {}

  async call(request: any): Promise<ToolOutput<ParsedResults>> {
    const args = request.params?.arguments || request.params || {};
    try {
      if (!args.jsonPath || typeof args.jsonPath !== 'string') {
        throw new Error('jsonPath is required');
      }
      const results = await this.artillery.parseResults(args.jsonPath);
      return {
        status: 'ok',
        tool: this.name,
        data: parseResultsDocument(results)
      };
    } catch (error) {
      return {
        status: 'error',
        tool: this.name,
        error: {
          code: 'PARSE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: { tool: this.name, arguments: args }
        }
      };
    }
  }
}
