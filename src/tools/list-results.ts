import { MCPTool, ToolOutput, ResultFileInfo } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';

export interface ListResultsOutput {
  count: number;
  results: ResultFileInfo[];
}

export class ListResultsTool implements MCPTool {
  readonly name = 'list_results';
  readonly description = 'List JSON result files in the working directory, newest first.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      limit: { type: 'number', minimum: 1, maximum: 500, description: 'Maximum number of files to return (default 100)' }
    }
  };

  constructor(private artillery: ArtilleryWrapper) {}

  async call(request: any): Promise<ToolOutput<ListResultsOutput>> {
    const args = request.params?.arguments || request.params || {};
    try {
      const results = await this.artillery.listResults(args.limit);
      return {
        status: 'ok',
        tool: this.name,
        data: { count: results.length, results }
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
