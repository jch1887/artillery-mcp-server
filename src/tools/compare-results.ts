/**
 * MCP Tool: compare_results
 * 
 * Compare two Artillery test results to detect performance regressions.
 */

import { MCPTool, ToolOutput, ArtillerySummary } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';
import { summariseResults } from '../lib/results.js';

export type LatencyPercentile = 'p50' | 'p95' | 'p99';

/** Comparison thresholds */
export interface ComparisonThresholds {
  /** Max allowed latency increase (percentage, e.g., 0.1 = 10%) */
  maxLatencyIncrease?: number;
  /** Max allowed error rate increase (percentage points) */
  maxErrorRateIncrease?: number;
  /** Min required throughput (as percentage of baseline, e.g., 0.9 = 90%) */
  minThroughputRatio?: number;
  /** Percentiles the latency threshold applies to (default: all three) */
  latencyPercentiles?: LatencyPercentile[];
}

/** Metric comparison result */
export interface MetricComparison {
  baseline: number;
  current: number;
  change: number;
  changePercent: number;
  status: 'improved' | 'unchanged' | 'degraded' | 'failed';
}

/** Complete comparison result */
export interface ComparisonResult {
  /** Overall pass/fail based on thresholds */
  passed: boolean;
  /** Summary of comparison */
  summary: string;
  /** Latency comparisons */
  latency: {
    p50: MetricComparison;
    p95: MetricComparison;
    p99: MetricComparison;
  };
  /** Throughput comparison */
  throughput: MetricComparison;
  /** Error rate comparison */
  errorRate: MetricComparison;
  /** Total requests comparison */
  totalRequests: MetricComparison;
  /** Thresholds used */
  thresholds: ComparisonThresholds;
  /** Failures (if any) */
  failures: string[];
}

const DEFAULT_THRESHOLDS: Required<ComparisonThresholds> = {
  maxLatencyIncrease: 0.2,
  maxErrorRateIncrease: 0.01,
  minThroughputRatio: 0.9,
  latencyPercentiles: ['p50', 'p95', 'p99']
};

export class CompareResultsTool implements MCPTool {
  readonly name = 'compare_results';
  readonly description = 'Compare two Artillery test results to detect performance regressions.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      baselinePath: {
        type: 'string',
        description: 'Path to baseline (previous/reference) JSON results file'
      },
      currentPath: {
        type: 'string',
        description: 'Path to current (new) JSON results file'
      },
      thresholds: {
        type: 'object',
        properties: {
          maxLatencyIncrease: {
            type: 'number',
            description: 'Max allowed latency increase (default: 0.2 = 20%)'
          },
          maxErrorRateIncrease: {
            type: 'number',
            description: 'Max allowed error rate increase in percentage points (default: 0.01 = 1%)'
          },
          minThroughputRatio: {
            type: 'number',
            description: 'Min throughput as ratio of baseline (default: 0.9 = 90%)'
          },
          latencyPercentiles: {
            type: 'array',
            items: { type: 'string', enum: ['p50', 'p95', 'p99'] },
            description: 'Percentiles the latency threshold applies to (default: all three)'
          }
        },
        description: 'Optional thresholds for pass/fail determination'
      }
    },
    required: ['baselinePath', 'currentPath']
  };

  constructor(private artillery: ArtilleryWrapper) {}

  async call(request: unknown): Promise<ToolOutput<ComparisonResult>> {
    try {
      // Extract arguments
      const req = request as { 
        params?: { 
          arguments?: { 
            baselinePath?: string; 
            currentPath?: string;
            thresholds?: ComparisonThresholds;
          } 
        } 
      };
      const args = req.params?.arguments || (request as { 
        baselinePath?: string; 
        currentPath?: string;
        thresholds?: ComparisonThresholds;
      });

      // Validate required fields
      if (!args.baselinePath || typeof args.baselinePath !== 'string') {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'baselinePath is required'
          }
        };
      }

      if (!args.currentPath || typeof args.currentPath !== 'string') {
        return {
          status: 'error',
          tool: this.name,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'currentPath is required'
          }
        };
      }

      // Parse both result files
      const baselineResults = await this.artillery.parseResults(args.baselinePath);
      const currentResults = await this.artillery.parseResults(args.currentPath);

      // Extract summaries
      const baselineSummary = this.extractSummary(baselineResults);
      const currentSummary = this.extractSummary(currentResults);

      // Merge thresholds with defaults
      const thresholds: Required<ComparisonThresholds> = {
        ...DEFAULT_THRESHOLDS,
        ...args.thresholds,
        latencyPercentiles: args.thresholds?.latencyPercentiles?.length
          ? args.thresholds.latencyPercentiles
          : DEFAULT_THRESHOLDS.latencyPercentiles
      };

      // Compare metrics
      const result = this.compareMetrics(baselineSummary, currentSummary, thresholds);

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

  private extractSummary(results: unknown): ArtillerySummary {
    return summariseResults(results);
  }

  private compareMetrics(
    baseline: ArtillerySummary,
    current: ArtillerySummary,
    thresholds: Required<ComparisonThresholds>
  ): ComparisonResult {
    const failures: string[] = [];

    const latency = {
      p50: this.compareMetric(baseline.latencyMs.p50, current.latencyMs.p50, 'lower'),
      p95: this.compareMetric(baseline.latencyMs.p95, current.latencyMs.p95, 'lower'),
      p99: this.compareMetric(baseline.latencyMs.p99, current.latencyMs.p99, 'lower')
    };
    const latencyP95 = latency.p95;

    for (const percentile of thresholds.latencyPercentiles) {
      const comparison = latency[percentile];
      if (comparison && comparison.changePercent > thresholds.maxLatencyIncrease * 100) {
        failures.push(
          `${percentile} latency increased by ${comparison.changePercent.toFixed(1)}%, ` +
          `exceeds threshold of ${thresholds.maxLatencyIncrease * 100}%`
        );
      }
    }

    // Compare throughput
    const throughput = this.compareMetric(baseline.rpsAvg, current.rpsAvg, 'higher');
    
    // Check throughput threshold
    if (baseline.rpsAvg > 0) {
      const throughputRatio = current.rpsAvg / baseline.rpsAvg;
      if (throughputRatio < thresholds.minThroughputRatio) {
        failures.push(
          `Throughput dropped to ${(throughputRatio * 100).toFixed(1)}% of baseline, ` +
          `below threshold of ${thresholds.minThroughputRatio * 100}%`
        );
      }
    }

    // Compare error rate
    const baselineErrorRate = baseline.requestsTotal > 0
      ? (baseline.errorsTotal / baseline.requestsTotal) * 100
      : 0;
    const currentErrorRate = current.requestsTotal > 0
      ? (current.errorsTotal / current.requestsTotal) * 100
      : 0;
    const errorRate = this.compareMetric(baselineErrorRate, currentErrorRate, 'lower');

    // Check error rate threshold
    const errorRateIncrease = currentErrorRate - baselineErrorRate;
    if (errorRateIncrease > thresholds.maxErrorRateIncrease * 100) {
      failures.push(
        `Error rate increased by ${errorRateIncrease.toFixed(2)} percentage points, ` +
        `exceeds threshold of ${thresholds.maxErrorRateIncrease * 100}%`
      );
    }

    // Compare total requests
    const totalRequests = this.compareMetric(baseline.requestsTotal, current.requestsTotal, 'higher');

    // Build summary
    const passed = failures.length === 0;
    let summary: string;
    
    if (passed) {
      const improvements: string[] = [];
      if (latencyP95.status === 'improved') improvements.push('latency improved');
      if (throughput.status === 'improved') improvements.push('throughput increased');
      if (errorRate.status === 'improved') improvements.push('errors decreased');
      
      summary = improvements.length > 0
        ? `✅ PASSED - ${improvements.join(', ')}`
        : '✅ PASSED - No significant changes detected';
    } else {
      summary = `❌ FAILED - ${failures.length} threshold(s) exceeded`;
    }

    return {
      passed,
      summary,
      latency,
      throughput,
      errorRate,
      totalRequests,
      thresholds,
      failures
    };
  }

  private compareMetric(
    baseline: number,
    current: number,
    betterDirection: 'higher' | 'lower'
  ): MetricComparison {
    const change = current - baseline;
    const changePercent = baseline !== 0 ? (change / baseline) * 100 : (current > 0 ? 100 : 0);
    
    // Determine status
    let status: MetricComparison['status'];
    const significanceThreshold = 5; // 5% change is considered significant
    
    if (Math.abs(changePercent) < significanceThreshold) {
      status = 'unchanged';
    } else if (betterDirection === 'lower') {
      status = change < 0 ? 'improved' : (changePercent > 50 ? 'failed' : 'degraded');
    } else {
      status = change > 0 ? 'improved' : (changePercent < -50 ? 'failed' : 'degraded');
    }

    return {
      baseline,
      current,
      change,
      changePercent,
      status
    };
  }
}
