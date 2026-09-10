#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import debug from 'debug';
import { promises as fs } from 'fs';
import { z, ZodRawShape } from 'zod';
import { ArtilleryWrapper } from './lib/artillery.js';
import { ConfigStorage } from './lib/config-storage.js';
import {
  RunTestFromFileTool,
  RunTestInlineTool,
  QuickTestTool,
  RunSavedConfigTool,
  ListCapabilitiesTool,
  ParseResultsTool,
  ListResultsTool,
  SaveConfigTool,
  ListConfigsTool,
  GetConfigTool,
  DeleteConfigTool,
  WizardStartTool,
  WizardStepTool,
  WizardFinalizeTool,
  RunPresetTestTool,
  CompareResultsTool
} from './tools/index.js';
import { MCPTool, ServerConfig, ToolOutput } from './types.js';
import { SERVER_VERSION } from './version.js';

const serverDebug = debug('artillery:mcp:server');
const errorsDebug = debug('artillery:mcp:errors');

const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 7_200_000;

const pathDescription = 'Path inside the working directory';
const runOutputShape = {
  outputJson: z.string().optional().describe(`${pathDescription} for JSON results`),
  reportHtml: z.string().optional().describe(`${pathDescription} for an HTML report (only on Artillery versions that still support reports)`),
  env: z.record(z.string()).optional().describe('Extra environment variables for Artillery (PATH and similar cannot be overridden)')
};
const wizardState = z.object({}).passthrough();

async function main() {
  try {
    const config = await loadConfiguration();
    const artillery = new ArtilleryWrapper(config);
    const configStorage = new ConfigStorage(config.workDir);
    await configStorage.initialize();

    const mcpServer = new McpServer({ name: 'artillery-mcp-server', version: SERVER_VERSION });
    registerTools(mcpServer, artillery, configStorage, config);

    await mcpServer.connect(new StdioServerTransport());
    serverDebug('Artillery MCP Server %s started (binary: %s, workDir: %s)', SERVER_VERSION, config.artilleryBin, config.workDir);
  } catch (error) {
    errorsDebug('Failed to start server:', error);
    console.error('Failed to start server:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function loadConfiguration(): Promise<ServerConfig> {
  const config: ServerConfig = {
    artilleryBin: await ArtilleryWrapper.detectBinary(),
    workDir: process.env.ARTILLERY_WORKDIR || process.cwd(),
    timeoutMs: parseInt(process.env.ARTILLERY_TIMEOUT_MS || '1800000', 10),
    maxOutputMb: parseInt(process.env.ARTILLERY_MAX_OUTPUT_MB || '10', 10),
    allowQuick: process.env.ARTILLERY_ALLOW_QUICK !== 'false'
  };

  try {
    config.workDir = await fs.realpath(config.workDir);
  } catch {
    throw new Error(`Working directory not accessible: ${config.workDir}`);
  }
  if (Number.isNaN(config.timeoutMs) || config.timeoutMs < MIN_TIMEOUT_MS || config.timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error('ARTILLERY_TIMEOUT_MS must be between 1 second and 2 hours');
  }
  if (Number.isNaN(config.maxOutputMb) || config.maxOutputMb < 1 || config.maxOutputMb > 100) {
    throw new Error('ARTILLERY_MAX_OUTPUT_MB must be between 1 and 100');
  }

  serverDebug('Configuration loaded: %o', config);
  return config;
}

async function callTool(tool: MCPTool, args: unknown) {
  let output: ToolOutput;
  try {
    output = await tool.call({ params: { arguments: args } });
  } catch (error) {
    output = {
      status: 'error',
      tool: tool.name,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    };
  }
  if (output.status === 'error') errorsDebug('%s failed: %o', tool.name, output.error);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    isError: output.status === 'error'
  };
}

function register(server: McpServer, tool: MCPTool, inputSchema: ZodRawShape) {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema },
    async (args) => callTool(tool, args)
  );
}

function registerTools(
  server: McpServer,
  artillery: ArtilleryWrapper,
  configStorage: ConfigStorage,
  config: ServerConfig
) {
  register(server, new RunTestFromFileTool(artillery), {
    path: z.string().describe(`${pathDescription} of the Artillery config file`),
    ...runOutputShape,
    cwd: z.string().optional().describe(`${pathDescription} to run the test from`),
    validateOnly: z.boolean().optional().describe('Do not run the test')
  });

  register(server, new RunTestInlineTool(artillery), {
    configText: z.string().describe('Artillery configuration as YAML or JSON text'),
    ...runOutputShape,
    cwd: z.string().optional().describe(`${pathDescription} to run the test from`),
    validateOnly: z.boolean().optional().describe('Do not run the test')
  });

  register(server, new QuickTestTool(artillery), {
    target: z.string().describe('URL to test'),
    rate: z.number().min(1).optional().describe('Requests per second (ignored when count is set, default 10)'),
    duration: z.string().optional().describe('Test duration such as "30s" or "1m" (default 10s)'),
    count: z.number().int().min(1).optional().describe('Total number of requests to send'),
    method: z.string().optional().describe('HTTP method (default GET)'),
    headers: z.record(z.string()).optional().describe('HTTP headers'),
    body: z.string().optional().describe('Request body; JSON text is sent as application/json'),
    insecure: z.boolean().optional().describe('Skip TLS certificate verification'),
    keepResults: z.boolean().optional().describe('Keep the JSON results file after the run'),
    outputJson: z.string().optional().describe(`${pathDescription} for JSON results (implies keepResults)`)
  });

  register(server, new ListCapabilitiesTool(artillery, config, SERVER_VERSION), {});

  register(server, new ParseResultsTool(artillery), {
    jsonPath: z.string().describe(`${pathDescription} of the Artillery JSON results file`)
  });

  register(server, new ListResultsTool(artillery), {
    limit: z.number().int().min(1).max(500).optional().describe('Maximum number of files to return (default 100)')
  });

  register(server, new SaveConfigTool(configStorage), {
    name: z.string().describe('Unique name for the config'),
    content: z.string().describe('Artillery configuration as YAML or JSON string'),
    description: z.string().optional().describe('Optional description'),
    tags: z.array(z.string()).optional().describe('Optional tags for organisation')
  });

  register(server, new ListConfigsTool(configStorage), {
    tag: z.string().optional().describe('Optional tag to filter configs by')
  });

  register(server, new GetConfigTool(configStorage), {
    name: z.string().describe('Name of the config to retrieve')
  });

  register(server, new DeleteConfigTool(configStorage), {
    name: z.string().describe('Name of the config to delete')
  });

  register(server, new RunSavedConfigTool(artillery, configStorage), {
    name: z.string().describe('Name of the saved config to run'),
    ...runOutputShape,
    validateOnly: z.boolean().optional().describe('Do not run the test')
  });

  register(server, new WizardStartTool(configStorage), {
    fromSavedConfig: z.string().optional().describe('Optional saved config name to use as starting point')
  });

  register(server, new WizardStepTool(), {
    state: wizardState.describe('The current wizard state'),
    action: z.string().describe('The action to perform'),
    value: z.union([z.string(), z.boolean(), z.number(), wizardState]).describe('The value for the action')
  });

  register(server, new WizardFinalizeTool(artillery, configStorage), {
    state: wizardState.describe('The completed wizard state'),
    runImmediately: z.boolean().optional().describe('If true, run the test immediately'),
    outputJson: runOutputShape.outputJson,
    reportHtml: runOutputShape.reportHtml
  });

  register(server, new RunPresetTestTool(artillery), {
    target: z.string().describe('Target URL to test'),
    preset: z.enum(['smoke', 'baseline', 'soak', 'spike']).describe('Test type preset'),
    path: z.string().optional().describe('Endpoint path (default: /)'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional().describe('HTTP method'),
    body: z.record(z.unknown()).optional().describe('Request body for POST/PUT'),
    ...runOutputShape
  });

  register(server, new CompareResultsTool(artillery), {
    baselinePath: z.string().describe(`${pathDescription} of the baseline JSON results`),
    currentPath: z.string().describe(`${pathDescription} of the current JSON results`),
    thresholds: z.object({
      maxLatencyIncrease: z.number().optional().describe('Max latency increase (default: 0.2 = 20%)'),
      maxErrorRateIncrease: z.number().optional().describe('Max error rate increase (default: 0.01 = 1%)'),
      minThroughputRatio: z.number().optional().describe('Min throughput ratio (default: 0.9 = 90%)'),
      latencyPercentiles: z.array(z.enum(['p50', 'p95', 'p99'])).optional().describe('Percentiles the latency threshold applies to (default: all three)')
    }).optional().describe('Custom thresholds')
  });

  serverDebug('Registered 16 tools');
}

main();
