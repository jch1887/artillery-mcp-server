/**
 * MCP Tool: compare_results
 * 
 * Compare two Artillery test results to detect performance regressions.
 */

import { MCPTool, ToolOutput, ArtillerySummary } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';

/** Comparison thresholds */
export interface ComparisonThresholds {
  /** Max allowed latency increase (percentage, e.g., 0.1 = 10%) */
  maxLatencyIncrease?: number;
  /** Max allowed error rate increase (percentage points) */
  maxErrorRateIncrease?: number;
  /** Min required throughput (as percentage of baseline, e.g., 0.9 = 90%) */
  minThroughputRatio?: number;
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
  maxLatencyIncrease: 0.2, // 20% increase allowed
  maxErrorRateIncrease: 0.01, // 1 percentage point increase allowed
  minThroughputRatio: 0.9 // Must maintain 90% of baseline throughput
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
        ...args.thresholds
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

  private extractSummary(results: Record<string, unknown>): ArtillerySummary & { errorCount: number } {
    const aggregate = (results.aggregate || {}) as Record<string, unknown>;
    const counters = (aggregate.counters || {}) as Record<string, number>;
    const rates = (aggregate.rates || {}) as Record<string, number>;
    const summaries = (aggregate.summaries || {}) as Record<string, Record<string, number>>;

    const requestsTotal = counters['http.requests'] || 0;
    const errorCount = counters['http.errors'] || 0;

    return {
      requestsTotal,
      rpsAvg: rates['http.request_rate'] || 0,
      latencyMs: {
        p50: summaries['http.response_time']?.p50 || 0,
        p95: summaries['http.response_time']?.p95 || 0,
        p99: summaries['http.response_time']?.p99 || 0
      },
      errors: { total: errorCount },
      errorCount
    };
  }

  private compareMetrics(
    baseline: ArtillerySummary & { errorCount: number },
    current: ArtillerySummary & { errorCount: number },
    thresholds: Required<ComparisonThresholds>
  ): ComparisonResult {
    const failures: string[] = [];

    // Compare latency
    const latencyP50 = this.compareMetric(baseline.latencyMs.p50, current.latencyMs.p50, 'lower');
    const latencyP95 = this.compareMetric(baseline.latencyMs.p95, current.latencyMs.p95, 'lower');
    const latencyP99 = this.compareMetric(baseline.latencyMs.p99, current.latencyMs.p99, 'lower');

    // Check latency threshold (using p95)
    if (latencyP95.changePercent > thresholds.maxLatencyIncrease * 100) {
      failures.push(
        `P95 latency increased by ${latencyP95.changePercent.toFixed(1)}%, ` +
        `exceeds threshold of ${thresholds.maxLatencyIncrease * 100}%`
      );
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
      ? (baseline.errorCount / baseline.requestsTotal) * 100 
      : 0;
    const currentErrorRate = current.requestsTotal > 0 
      ? (current.errorCount / current.requestsTotal) * 100 
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
      latency: {
        p50: latencyP50,
        p95: latencyP95,
        p99: latencyP99
      },
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




