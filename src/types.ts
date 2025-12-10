/**
 * Artillery MCP Server Type Definitions
 * 
 * This module contains all TypeScript types used throughout the Artillery MCP Server.
 * Types are organized by concern: configuration, tool inputs, results, and outputs.
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Server configuration loaded from environment variables.
 * Controls behavior of the Artillery wrapper and MCP tools.
 */
export interface ServerConfig {
  /** Path to the Artillery CLI binary */
  artilleryBin: string;
  /** Working directory for test files and outputs */
  workDir: string;
  /** Maximum execution time for any Artillery command (ms) */
  timeoutMs: number;
  /** Maximum size of captured stdout/stderr (MB) */
  maxOutputMb: number;
  /** Whether the quick_test tool is enabled */
  allowQuick: boolean;
}

// ============================================================================
// Tool Input Types
// ============================================================================

/** Input parameters for the run_test_from_file tool */
export interface RunTestFromFileInput {
  /** Path to the Artillery config file (absolute or relative to workDir) */
  path: string;
  /** Optional path to write JSON results output */
  outputJson?: string;
  /** Optional path to write HTML report */
  reportHtml?: string;
  /** Environment variables to pass to Artillery */
  env?: Record<string, string>;
  /** Working directory for the test execution */
  cwd?: string;
  /** If true, only validate the config without running */
  validateOnly?: boolean;
}

/** Input parameters for the run_test_inline tool */
export interface RunTestInlineInput {
  /** Artillery configuration as YAML or JSON string */
  configText: string;
  /** Optional path to write JSON results output */
  outputJson?: string;
  /** Optional path to write HTML report */
  reportHtml?: string;
  /** Environment variables to pass to Artillery */
  env?: Record<string, string>;
  /** Working directory for the test execution */
  cwd?: string;
  /** If true, only validate the config without running */
  validateOnly?: boolean;
}

/** Input parameters for the quick_test tool */
export interface QuickTestInput {
  /** Target URL to test */
  target: string;
  /** Requests per second */
  rate?: number;
  /** Test duration (e.g., "1m", "30s") */
  duration?: string;
  /** Total number of virtual users */
  count?: number;
  /** HTTP method (default: GET) */
  method?: string;
  /** HTTP headers to include */
  headers?: Record<string, string>;
  /** Request body */
  body?: string;
}

// ============================================================================
// Artillery Result Types
// ============================================================================

/** Summary metrics from an Artillery test run */
export interface ArtillerySummary {
  /** Total number of HTTP requests made */
  requestsTotal: number;
  /** Average requests per second */
  rpsAvg: number;
  /** Response time percentiles in milliseconds */
  latencyMs: {
    p50: number;
    p95: number;
    p99: number;
  };
  /** Error counts by error type/code */
  errors: Record<string, number>;
}

/** Complete result from an Artillery test execution */
export interface ArtilleryResult {
  /** Process exit code (0 = success) */
  exitCode: number;
  /** Total execution time in milliseconds */
  elapsedMs: number;
  /** Last 2KB of stdout/stderr output */
  logsTail: string;
  /** Path to JSON results file (if outputJson was specified) */
  jsonResultPath?: string;
  /** Path to HTML report file (if reportHtml was specified) */
  htmlReportPath?: string;
  /** Parsed summary metrics (if available) */
  summary?: ArtillerySummary;
}

// ============================================================================
// MCP Tool Output Types
// ============================================================================

/** Standard error codes returned by tools */
export type ToolErrorCode = 
  | 'EXECUTION_ERROR'
  | 'VALIDATION_ERROR'
  | 'CAPABILITIES_ERROR'
  | 'PARSE_ERROR'
  | 'INTERNAL_ERROR';

/** Structured error information */
export interface ToolError {
  /** Error code for programmatic handling */
  code: ToolErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional context about the error */
  details?: Record<string, unknown>;
}

/** Standard output format for all MCP tools */
export interface ToolOutput<T = unknown> {
  /** Whether the operation succeeded */
  status: 'ok' | 'error';
  /** Name of the tool that produced this output */
  tool: string;
  /** Result data (present on success) */
  data?: T;
  /** Error information (present on failure) */
  error?: ToolError;
}

// ============================================================================
// Capabilities and Results Types
// ============================================================================

/** Server capabilities returned by list_capabilities tool */
export interface ServerCapabilities {
  /** Version of Artillery CLI detected */
  artilleryVersion: string;
  /** Version of this MCP server */
  serverVersion: string;
  /** Supported transport protocols */
  transports: string[];
  /** Server limits and settings */
  limits: {
    maxTimeoutMs: number;
    maxOutputMb: number;
    allowQuick: boolean;
  };
  /** Configured paths */
  configPaths: {
    workDir: string;
    artilleryBin: string;
  };
}

/** Scenario-level statistics from parsed results */
export interface ScenarioStats {
  /** Scenario name */
  name: string;
  /** Number of times this scenario was executed */
  count: number;
  /** Success rate as percentage (0-100) */
  successRate: number;
  /** Average latency in milliseconds */
  avgLatency: number;
}

/** Parsed and structured results from an Artillery JSON output file */
export interface ParsedResults {
  /** Aggregate summary metrics */
  summary: ArtillerySummary;
  /** Per-scenario breakdown */
  scenarios: ScenarioStats[];
  /** Test run metadata */
  metadata: {
    timestamp: string;
    duration: string;
    totalRequests: number;
  };
}

// ============================================================================
// MCP Tool Interface
// ============================================================================

/** Interface that all MCP tools must implement */
export interface MCPTool {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for tool input validation */
  inputSchema: Record<string, unknown>;
  /** Execute the tool with the given request */
  call: (request: unknown) => Promise<ToolOutput<unknown>>;
}
