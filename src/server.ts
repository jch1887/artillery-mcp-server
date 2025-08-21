#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import debug from 'debug';
import { promises as fs } from 'fs';
import { ArtilleryWrapper } from './lib/artillery.js';
import {
  RunTestFromFileTool,
  RunTestInlineTool,
  QuickTestTool,
  ListCapabilitiesTool,
  ParseResultsTool
} from './tools/index.js';
import { ServerConfig, MCPTool } from './types.js';
import { z } from 'zod';

const SERVER_VERSION = '1.0.1';
const serverDebug = debug('artillery:mcp:server');
const errorsDebug = debug('artillery:mcp:errors');

async function main() {
  try {
    serverDebug('Starting Artillery MCP Server...');
    
    // Load configuration
    const config = await loadConfiguration();
    
    // Create MCP server
    const mcpServer = new McpServer({
      name: 'artillery-mcp-server',
      version: SERVER_VERSION,
    });

    // Create Artillery wrapper
    const artillery = new ArtilleryWrapper(config);

    // Register tools
    registerTools(mcpServer, artillery, config);

    // Connect to transport
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    
    serverDebug('Artillery MCP Server started successfully');
    serverDebug('Server version:', SERVER_VERSION);
    serverDebug('Artillery binary:', config.artilleryBin);
    serverDebug('Working directory:', config.workDir);
    
  } catch (error) {
    errorsDebug('Failed to start server:', error);
    process.exit(1);
  }
}

async function loadConfiguration(): Promise<ServerConfig> {
  // Load configuration from environment variables
  const config: ServerConfig = {
    artilleryBin: process.env.ARTILLERY_BIN || '',
    workDir: process.env.ARTILLERY_WORKDIR || process.cwd(),
    timeoutMs: parseInt(process.env.ARTILLERY_TIMEOUT_MS || '1800000'), // 30 minutes default
    maxOutputMb: parseInt(process.env.ARTILLERY_MAX_OUTPUT_MB || '10'), // 10MB default
    allowQuick: process.env.ARTILLERY_ALLOW_QUICK === 'true'
  };

  serverDebug('Initial config loaded:', {
    artilleryBin: config.artilleryBin,
    workDir: config.workDir,
    timeoutMs: config.timeoutMs,
    maxOutputMb: config.maxOutputMb,
    allowQuick: config.allowQuick
  });

  // Validate and detect Artillery binary
  try {
    const detectedBinary = await ArtilleryWrapper.detectBinary();
    serverDebug('Artillery binary detected:', detectedBinary);
    
    config.artilleryBin = detectedBinary;
    serverDebug('Config.artilleryBin after assignment:', config.artilleryBin);
  } catch (error) {
    errorsDebug('Failed to detect Artillery binary:', error);
    throw error;
  }

  // Validate working directory
  try {
    await fs.access(config.workDir);
    serverDebug('Working directory:', config.workDir);
  } catch (error) {
    errorsDebug('Working directory not accessible:', config.workDir, error);
    throw error;
  }

  // Validate timeout
  if (config.timeoutMs < 1000 || config.timeoutMs > 7200000) {
    throw new Error('ARTILLERY_TIMEOUT_MS must be between 1 second and 2 hours');
  }

  // Validate output size limit
  if (config.maxOutputMb < 1 || config.maxOutputMb > 100) {
    throw new Error('ARTILLERY_MAX_OUTPUT_MB must be between 1 and 100');
  }

  serverDebug('Configuration loaded successfully');
  serverDebug('Final config:', {
    artilleryBin: config.artilleryBin,
    workDir: config.workDir,
    timeoutMs: config.timeoutMs,
    maxOutputMb: config.maxOutputMb,
    allowQuick: config.allowQuick
  });
  
  return config;
}

function registerTools(mcpServer: McpServer, artillery: ArtilleryWrapper, config: ServerConfig) {
  // Register run_test_from_file tool
  mcpServer.registerTool('run_test_from_file', {
    description: 'Run an Artillery test from a config file path.',
    inputSchema: {
      path: z.string().describe('Path to Artillery config file'),
      outputJson: z.string().optional().describe('Path for JSON results output'),
      reportHtml: z.string().optional().describe('Path for HTML report output'),
      env: z.record(z.string()).optional().describe('Environment variables'),
      cwd: z.string().optional().describe('Working directory'),
      validateOnly: z.boolean().optional().describe('Only validate config, do not run')
    }
  }, async (args) => {
    try {
      const tool = new RunTestFromFileTool(artillery);
      const result = await tool.call({ params: { arguments: args } });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              tool: 'run_test_from_file',
              error: {
                code: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred'
              }
            })
          }
        ]
      };
    }
  });

  // Register run_test_inline tool
  mcpServer.registerTool('run_test_inline', {
    description: 'Run an Artillery test from inline configuration text.',
    inputSchema: {
      configText: z.string().describe('Artillery configuration as text'),
      outputJson: z.string().optional().describe('Path for JSON results output'),
      reportHtml: z.string().optional().describe('Path for HTML report output'),
      env: z.record(z.string()).optional().describe('Environment variables'),
      cwd: z.string().optional().describe('Working directory'),
      validateOnly: z.boolean().optional().describe('Only validate config, do not run')
    }
  }, async (args) => {
    try {
      const tool = new RunTestInlineTool(artillery);
      const result = await tool.call({ params: { arguments: args } });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              tool: 'run_test_inline',
              error: {
                code: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred'
              }
            })
          }
        ]
      };
    }
  });

  // Register quick_test tool
  mcpServer.registerTool('quick_test', {
    description: 'Run a quick HTTP test (if supported by Artillery).',
    inputSchema: {
      target: z.string().describe('URL to test'),
      rate: z.number().min(1).optional().describe('Requests per second'),
      duration: z.string().optional().describe('Test duration (e.g., "1m")'),
      count: z.number().min(1).optional().describe('Total request count'),
      method: z.string().optional().describe('HTTP method'),
      headers: z.record(z.string()).optional().describe('HTTP headers'),
      body: z.string().optional().describe('Request body')
    }
  }, async (args) => {
    try {
      const tool = new QuickTestTool(artillery);
      const result = await tool.call({ params: { arguments: args } });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              tool: 'quick_test',
              error: {
                code: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred'
              }
            })
          }
        ]
      };
    }
  });

  // Register list_capabilities tool
  mcpServer.registerTool('list_capabilities', {
    description: 'Report versions, detected features, and server limits.',
    inputSchema: {}
  }, async () => {
    try {
      const tool = new ListCapabilitiesTool(artillery, config, SERVER_VERSION);
      const result = await tool.call({ params: { arguments: {} } });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              tool: 'list_capabilities',
              error: {
                code: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred'
              }
            })
          }
        ]
      };
    }
  });

  // Register parse_results tool
  mcpServer.registerTool('parse_results', {
    description: 'Parse Artillery JSON results and return summary.',
    inputSchema: {
      jsonPath: z.string().describe('Path to Artillery JSON results file')
    }
  }, async (args) => {
    try {
      const tool = new ParseResultsTool(artillery);
      const result = await tool.call({ params: { arguments: args } });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              tool: 'parse_results',
              error: {
                code: 'INTERNAL_ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred'
              }
            })
          }
        ]
      };
    }
  });

  serverDebug('All tools registered successfully');
}

// Start the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
