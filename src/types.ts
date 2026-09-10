/** Server configuration loaded from environment variables. */
export interface ServerConfig {
  artilleryBin: string;
  workDir: string;
  timeoutMs: number;
  maxOutputMb: number;
  allowQuick: boolean;
}

/** Options shared by every tool that runs Artillery. All paths must stay inside the working directory. */
export interface RunOptions {
  outputJson?: string;
  reportHtml?: string;
  env?: Record<string, string>;
  cwd?: string;
}

export interface RunTestFromFileInput extends RunOptions {
  path: string;
  validateOnly?: boolean;
}

export interface RunTestInlineInput extends RunOptions {
  configText: string;
  validateOnly?: boolean;
}

export interface QuickTestInput {
  target: string;
  /** Virtual users started per second (ignored when count is set) */
  rate?: number;
  /** Test duration such as "30s" or "1m" */
  duration?: string;
  /** Total number of requests to send, one per virtual user */
  count?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Skip TLS certificate verification */
  insecure?: boolean;
  /** Keep the JSON results file after the run */
  keepResults?: boolean;
  /** Write JSON results to this path instead of an auto-generated one (implies keepResults) */
  outputJson?: string;
}

export interface ArtillerySummary {
  requestsTotal: number;
  responsesTotal: number;
  rpsAvg: number;
  latencyMs: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  /** Response counts keyed by HTTP status code */
  httpCodes: Record<string, number>;
  /** Error counts keyed by Artillery error name, e.g. ETIMEDOUT */
  errors: Record<string, number>;
  errorsTotal: number;
  vusers: {
    created: number;
    completed: number;
    failed: number;
  };
}

export interface ArtilleryResult {
  /** Process exit code. Artillery exits non-zero when ensure thresholds fail. */
  exitCode: number;
  elapsedMs: number;
  timedOut?: boolean;
  /** Last 2KB of stdout followed by the last 2KB of stderr */
  logsTail: string;
  jsonResultPath?: string;
  htmlReportPath?: string;
  summary?: ArtillerySummary;
  warnings?: string[];
}

export interface QuickTestResult extends ArtilleryResult {
  /** The Artillery script that was generated and run */
  config: Record<string, unknown>;
}

export interface ResultFileInfo {
  path: string;
  sizeBytes: number;
  modifiedAt: string;
}

export type ToolErrorCode =
  | 'EXECUTION_ERROR'
  | 'VALIDATION_ERROR'
  | 'CAPABILITIES_ERROR'
  | 'PARSE_ERROR'
  | 'INTERNAL_ERROR';

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ToolOutput<T = unknown> {
  status: 'ok' | 'error';
  tool: string;
  data?: T;
  error?: ToolError;
}

export interface ServerCapabilities {
  artilleryVersion: string;
  serverVersion: string;
  transports: string[];
  limits: {
    maxTimeoutMs: number;
    maxOutputMb: number;
    allowQuick: boolean;
  };
  configPaths: {
    workDir: string;
    artilleryBin: string;
  };
}

export interface ScenarioStats {
  name: string;
  /** Virtual users created for this scenario */
  count: number;
}

export interface ParsedResults {
  summary: ArtillerySummary;
  scenarios: ScenarioStats[];
  metadata: {
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    totalRequests: number;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (request: unknown) => Promise<ToolOutput<unknown>>;
}
