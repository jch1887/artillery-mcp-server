import { z } from 'zod';

// Configuration types
export interface ServerConfig {
  artilleryBin: string;
  workDir: string;
  timeoutMs: number;
  maxOutputMb: number;
  allowQuick: boolean;
}

// Tool input schemas - conforming to MCP requirements
export const RunTestFromFileSchema = z.object({
  type: z.literal('object'),
  properties: z.object({
    path: z.object({ type: z.literal('string'), description: z.string() }),
    outputJson: z.object({ type: z.literal('string'), description: z.string() }).optional(),
    reportHtml: z.object({ type: z.literal('string'), description: z.string() }).optional(),
    env: z.object({ type: z.literal('object'), additionalProperties: z.object({ type: z.literal('string') }) }).optional(),
    cwd: z.object({ type: z.literal('string') }).optional(),
    validateOnly: z.object({ type: z.literal('boolean'), default: z.boolean() }).optional()
  }),
  required: z.array(z.literal('path'))
});

export const RunTestInlineSchema = z.object({
  type: z.literal('object'),
  properties: z.object({
    configText: z.object({ type: z.literal('string'), description: z.string() }),
    outputJson: z.object({ type: z.literal('string') }).optional(),
    reportHtml: z.object({ type: z.literal('string') }).optional(),
    env: z.object({ type: z.literal('object'), additionalProperties: z.object({ type: z.literal('string') }) }).optional(),
    cwd: z.object({ type: z.literal('string') }).optional(),
    validateOnly: z.object({ type: z.literal('boolean'), default: z.boolean() }).optional()
  }),
  required: z.array(z.literal('configText'))
});

export const QuickTestSchema = z.object({
  type: z.literal('object'),
  properties: z.object({
    target: z.object({ type: z.literal('string'), description: z.string() }),
    rate: z.object({ type: z.literal('number'), minimum: z.number() }).optional(),
    duration: z.object({ type: z.literal('string'), description: z.string() }).optional(),
    count: z.object({ type: z.literal('number'), minimum: z.number() }).optional(),
    method: z.object({ type: z.literal('string'), default: z.string() }).optional(),
    headers: z.object({ type: z.literal('object'), additionalProperties: z.object({ type: z.literal('string') }) }).optional(),
    body: z.object({ type: z.literal('string') }).optional()
  }),
  required: z.array(z.literal('target'))
});

// Tool input types for internal use
export interface RunTestFromFileInput {
  path: string;
  outputJson?: string;
  reportHtml?: string;
  env?: Record<string, string>;
  cwd?: string;
  validateOnly?: boolean;
}

export interface RunTestInlineInput {
  configText: string;
  outputJson?: string;
  reportHtml?: string;
  env?: Record<string, string>;
  cwd?: string;
  validateOnly?: boolean;
}

export interface QuickTestInput {
  target: string;
  rate?: number;
  duration?: string;
  count?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

// Artillery result types
export interface ArtillerySummary {
  requestsTotal: number;
  rpsAvg: number;
  latencyMs: {
    p50: number;
    p95: number;
    p99: number;
  };
  errors: Record<string, number>;
}

export interface ArtilleryResult {
  exitCode: number;
  elapsedMs: number;
  logsTail: string;
  jsonResultPath?: string;
  htmlReportPath?: string;
  summary?: ArtillerySummary;
}

// Tool output types
export interface ToolOutput<T = any> {
  status: 'ok' | 'error';
  tool: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Capabilities response
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

// Parsed results
export interface ParsedResults {
  summary: ArtillerySummary;
  scenarios: Array<{
    name: string;
    count: number;
    successRate: number;
    avgLatency: number;
  }>;
  metadata: {
    timestamp: string;
    duration: string;
    totalRequests: number;
  };
}

// MCP Tool interface
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any; // MCP-compatible schema
  call: (request: any) => Promise<ToolOutput<any>>;
}
