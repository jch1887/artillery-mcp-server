#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
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
import { 
  CallToolRequestSchema, 
  Tool
} from '@modelcontextprotocol/sdk/types.js';

const SERVER_VERSION = '1.0.0';
const serverDebug = debug('artillery:mcp:server');
const errorsDebug = debug('artillery:mcp:errors');

class ArtilleryMCPServer {
  private server: Server;
  private config!: ServerConfig;
  private artillery!: ArtilleryWrapper;
  private tools: Tool[] = [];

  constructor() {
    this.server = new Server({
      name: 'artillery-mcp-server',
      version: SERVER_VERSION,
    });

    // Register required capabilities for tools
    this.server.registerCapabilities({
      tools: {},
    });

    this.setupTransport();
    this.setupErrorHandling();
  }

  private setupTransport() {
    const transport = new StdioServerTransport();
    this.server.connect(transport);
  }

  private setupErrorHandling() {
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
    
    process.on('uncaughtException', (error) => {
      errorsDebug('Uncaught exception:', error);
      this.gracefulShutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      errorsDebug('Unhandled rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown(1);
    });
  }

  private async loadConfiguration(): Promise<ServerConfig> {
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

  private async registerTools() {
    this.artillery = new ArtilleryWrapper(this.config);

    const toolInstances: MCPTool[] = [
      new RunTestFromFileTool(this.artillery),
      new RunTestInlineTool(this.artillery),
      new QuickTestTool(this.artillery),
      new ListCapabilitiesTool(this.artillery, this.config, SERVER_VERSION),
      new ParseResultsTool(this.artillery)
    ];

    for (const tool of toolInstances) {
      // Create tool schema for MCP
      const toolSchema: Tool = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      };

      this.tools.push(toolSchema);
      serverDebug('Tool registered:', tool.name);
    }

    // Register request handlers
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params?.name;
      const tool = toolInstances.find(t => t.name === toolName);
      
      if (!tool) {
        serverDebug('Unknown tool requested:', toolName);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                tool: toolName,
                error: {
                  code: 'UNKNOWN_TOOL',
                  message: `Tool '${toolName}' not found`
                }
              })
            }
          ]
        };
      }

      serverDebug('Tool called:', tool.name);
      
      try {
        const result = await tool.call(request);
        serverDebug('Tool completed:', tool.name, { status: result.status });
        
        // Convert to MCP result format
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        errorsDebug('Tool failed:', tool.name, { 
          error: error instanceof Error ? error.message : error 
        });
        
        const errorResult = {
          status: 'error',
          tool: tool.name,
          error: {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
            details: { tool: tool.name }
          }
        };
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(errorResult)
            }
          ]
        };
      }
    });
  }

  private async gracefulShutdown(exitCode = 0) {
    serverDebug('Shutting down gracefully...');
    
    try {
      // Close server connections
      await this.server.close();
      serverDebug('Server closed successfully');
    } catch (error) {
      errorsDebug('Error during shutdown:', error);
    }

    process.exit(exitCode);
  }

  async start() {
    try {
      serverDebug('Starting Artillery MCP Server...');
      
      // Load configuration
      this.config = await this.loadConfiguration();
      
      // Register tools
      await this.registerTools();
      
      serverDebug('Artillery MCP Server started successfully');
      serverDebug('Server version:', SERVER_VERSION);
      serverDebug('Artillery binary:', this.config.artilleryBin);
      serverDebug('Working directory:', this.config.workDir);
      serverDebug('Timeout (ms):', this.config.timeoutMs);
      serverDebug('Max output (MB):', this.config.maxOutputMb);
      serverDebug('Quick tests enabled:', this.config.allowQuick);
      
    } catch (error) {
      errorsDebug('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new ArtilleryMCPServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
