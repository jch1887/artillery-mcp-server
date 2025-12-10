#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import debug from 'debug';
import { promises as fs } from 'fs';
import { ArtilleryWrapper } from './lib/artillery.js';
import { ConfigStorage } from './lib/config-storage.js';
import {
  RunTestFromFileTool,
  RunTestInlineTool,
  QuickTestTool,
  RunSavedConfigTool,
  ListCapabilitiesTool,
  ParseResultsTool,
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
import { ServerConfig } from './types.js';
import { z } from 'zod';


const SERVER_VERSION = '1.0.4';

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

    // Create and initialize config storage
    const configStorage = new ConfigStorage(config.workDir);
    await configStorage.initialize();
    serverDebug('Config storage initialized at:', config.workDir + '/saved-configs');

    // Register tools
    registerTools(mcpServer, artillery, configStorage, config);

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
    allowQuick: process.env.ARTILLERY_ALLOW_QUICK !== 'false'
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

function registerTools(
  mcpServer: McpServer, 
  artillery: ArtilleryWrapper, 
  configStorage: ConfigStorage,
  config: ServerConfig
) {
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

  // ==========================================================================
  // Saved Config Tools
  // ==========================================================================

  // Register save_config tool
  mcpServer.registerTool('save_config', {
    description: 'Save a new Artillery configuration or update an existing one.',
    inputSchema: {
      name: z.string().describe('Unique name for the config'),
      content: z.string().describe('Artillery configuration as YAML or JSON string'),
      description: z.string().optional().describe('Optional description'),
      tags: z.array(z.string()).optional().describe('Optional tags for organization')
    }
  }, async (args) => {
    try {
      const tool = new SaveConfigTool(configStorage);
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
              tool: 'save_config',
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

  // Register list_configs tool
  mcpServer.registerTool('list_configs', {
    description: 'List all saved Artillery configurations.',
    inputSchema: {
      tag: z.string().optional().describe('Optional tag to filter configs by')
    }
  }, async (args) => {
    try {
      const tool = new ListConfigsTool(configStorage);
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
              tool: 'list_configs',
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

  // Register get_config tool
  mcpServer.registerTool('get_config', {
    description: 'Retrieve a saved Artillery configuration by name.',
    inputSchema: {
      name: z.string().describe('Name of the config to retrieve')
    }
  }, async (args) => {
    try {
      const tool = new GetConfigTool(configStorage);
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
              tool: 'get_config',
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

  // Register delete_config tool
  mcpServer.registerTool('delete_config', {
    description: 'Delete a saved Artillery configuration.',
    inputSchema: {
      name: z.string().describe('Name of the config to delete')
    }
  }, async (args) => {
    try {
      const tool = new DeleteConfigTool(configStorage);
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
              tool: 'delete_config',
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

  // Register run_saved_config tool
  mcpServer.registerTool('run_saved_config', {
    description: 'Run an Artillery test using a previously saved configuration.',
    inputSchema: {
      name: z.string().describe('Name of the saved config to run'),
      outputJson: z.string().optional().describe('Path for JSON results output'),
      reportHtml: z.string().optional().describe('Path for HTML report output'),
      env: z.record(z.string()).optional().describe('Environment variables'),
      validateOnly: z.boolean().optional().describe('Only validate config, do not run')
    }
  }, async (args) => {
    try {
      const tool = new RunSavedConfigTool(artillery, configStorage);
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
              tool: 'run_saved_config',
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

  // ==========================================================================
  // Wizard Tools
  // ==========================================================================

  // Register wizard_start tool
  mcpServer.registerTool('wizard_start', {
    description: 'Start a new interactive wizard for building Artillery test configurations.',
    inputSchema: {
      fromSavedConfig: z.string().optional().describe('Optional saved config name to use as starting point')
    }
  }, async (args) => {
    try {
      const tool = new WizardStartTool(configStorage);
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
              tool: 'wizard_start',
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

  // Register wizard_step tool
  mcpServer.registerTool('wizard_step', {
    description: 'Advance the wizard to the next step based on user input.',
    inputSchema: {
      state: z.object({}).passthrough().describe('The current wizard state'),
      action: z.string().describe('The action to perform'),
      value: z.union([
        z.string(),
        z.boolean(),
        z.number(),
        z.object({}).passthrough()
      ]).describe('The value for the action')
    }
  }, async (args) => {
    try {
      const tool = new WizardStepTool();
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
              tool: 'wizard_step',
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

  // Register wizard_finalize tool
  mcpServer.registerTool('wizard_finalize', {
    description: 'Generate final Artillery config from completed wizard state. Optionally save and/or run it.',
    inputSchema: {
      state: z.object({}).passthrough().describe('The completed wizard state'),
      runImmediately: z.boolean().optional().describe('If true, run the test immediately'),
      outputJson: z.string().optional().describe('Path for JSON results output'),
      reportHtml: z.string().optional().describe('Path for HTML report output')
    }
  }, async (args) => {
    try {
      const tool = new WizardFinalizeTool(artillery, configStorage);
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
              tool: 'wizard_finalize',
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

  // ==========================================================================
  // Advanced Testing Tools
  // ==========================================================================

  // Register run_preset_test tool
  mcpServer.registerTool('run_preset_test', {
    description: 'Run a preset test type (smoke, baseline, soak, spike) with minimal configuration.',
    inputSchema: {
      target: z.string().describe('Target URL to test'),
      preset: z.enum(['smoke', 'baseline', 'soak', 'spike']).describe('Test type preset'),
      path: z.string().optional().describe('Endpoint path (default: /)'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional().describe('HTTP method'),
      body: z.record(z.unknown()).optional().describe('Request body for POST/PUT'),
      outputJson: z.string().optional().describe('Path for JSON results'),
      reportHtml: z.string().optional().describe('Path for HTML report'),
      env: z.record(z.string()).optional().describe('Environment variables')
    }
  }, async (args) => {
    try {
      const tool = new RunPresetTestTool(artillery);
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
              tool: 'run_preset_test',
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

  // Register compare_results tool
  mcpServer.registerTool('compare_results', {
    description: 'Compare two Artillery test results to detect performance regressions.',
    inputSchema: {
      baselinePath: z.string().describe('Path to baseline JSON results'),
      currentPath: z.string().describe('Path to current JSON results'),
      thresholds: z.object({
        maxLatencyIncrease: z.number().optional().describe('Max latency increase (default: 0.2 = 20%)'),
        maxErrorRateIncrease: z.number().optional().describe('Max error rate increase (default: 0.01 = 1%)'),
        minThroughputRatio: z.number().optional().describe('Min throughput ratio (default: 0.9 = 90%)')
      }).optional().describe('Custom thresholds')
    }
  }, async (args) => {
    try {
      const tool = new CompareResultsTool(artillery);
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
              tool: 'compare_results',
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

  serverDebug('All tools registered successfully (15 tools)');
}

// Start the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
