import { MCPTool, ToolOutput, ParsedResults } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';
import { promises as fs } from 'fs';
import path from 'path';

export class ParseResultsTool implements MCPTool {
  readonly name = 'parse_results';
  readonly description = 'Parse and summarize Artillery JSON results file.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      jsonPath: { type: 'string', description: 'Path to Artillery JSON results file' }
    },
    required: ['jsonPath']
  };

  constructor(private artillery: ArtilleryWrapper) {}

  async call(request: any): Promise<ToolOutput<ParsedResults>> {
    try {
      // Extract arguments from MCP request
      const args = request.params?.arguments || request.params || {};
      const { jsonPath } = args;
      
      // Validate and sanitize path
      if (!path.isAbsolute(jsonPath)) {
        throw new Error('Path must be absolute');
      }

      // Parse the results
      const results = await this.artillery.parseResults(jsonPath);
      
      // Extract summary
      const metrics = results.metrics || {};
      const http = metrics.http || {};
      
      const summary = {
        requestsTotal: http.requests?.count || 0,
        rpsAvg: http.requests?.rate || 0,
        latencyMs: {
          p50: http.response_time?.p50 || 0,
          p95: http.response_time?.p95 || 0,
          p99: http.response_time?.p99 || 0
        },
        errors: http.errors || {}
      };

      // Extract scenario information
      const scenarios = results.scenarios || [];
      const scenarioBreakdown = scenarios.map((scenario: any) => ({
        name: scenario.name || 'Unknown',
        count: scenario.count || 0,
        successRate: scenario.successRate || 0,
        avgLatency: scenario.avgLatency || 0
      }));

      // Extract metadata
      const metadata = {
        timestamp: results.timestamp || new Date().toISOString(),
        duration: results.duration || 'Unknown',
        totalRequests: summary.requestsTotal
      };

      const parsedResults: ParsedResults = {
        summary,
        scenarios: scenarioBreakdown,
        metadata
      };

      return {
        status: 'ok',
        tool: this.name,
        data: parsedResults
      };

    } catch (error) {
      return {
        status: 'error',
        tool: this.name,
        error: {
          code: 'PARSE_ERROR',
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
