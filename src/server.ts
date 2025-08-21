#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pino from 'pino';
import { promises as fs } from 'fs';
import path from 'path';
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
  Tool, 
  ToolSchema,
  CallToolResultSchema 
} from '@modelcontextprotocol/sdk/types.js';

const SERVER_VERSION = '1.0.0';

class ArtilleryMCPServer {
  private server: Server;
  private logger: pino.Logger;
  private config!: ServerConfig;
  private artillery!: ArtilleryWrapper;
  private tools: Tool[] = [];

  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true
        }
      }
    });

    this.server = new Server({
      name: 'artillery-mcp-server',
      version: SERVER_VERSION,
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
      this.logger.error('Uncaught exception:', error);
      this.gracefulShutdown(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
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

    // Validate and detect Artillery binary
    try {
      config.artilleryBin = await ArtilleryWrapper.detectBinary();
      this.logger.info('Artillery binary detected:', config.artilleryBin);
    } catch (error) {
      this.logger.error('Failed to detect Artillery binary:', error);
      throw error;
    }

    // Validate working directory
    try {
      await fs.access(config.workDir);
      this.logger.info('Working directory:', config.workDir);
    } catch (error) {
      this.logger.error('Working directory not accessible:', config.workDir);
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

    this.logger.info('Configuration loaded successfully');
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

      this.logger.info(`Tool registered: ${tool.name}`);
    }

    // Register a single request handler for all tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params?.name;
      const tool = toolInstances.find(t => t.name === toolName);
      
      if (!tool) {
        this.logger.warn(`Unknown tool requested: ${toolName}`);
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

      this.logger.info(`Tool called: ${tool.name}`);
      
      try {
        const result = await tool.call(request);
        this.logger.info(`Tool completed: ${tool.name}`, { status: result.status });
        
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
        this.logger.error(`Tool failed: ${tool.name}`, { 
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
    this.logger.info('Shutting down gracefully...');
    
    try {
      // Close server connections
      await this.server.close();
      this.logger.info('Server closed successfully');
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
    }

    process.exit(exitCode);
  }

  async start() {
    try {
      this.logger.info('Starting Artillery MCP Server...');
      
      // Load configuration
      this.config = await this.loadConfiguration();
      
      // Register tools
      await this.registerTools();
      
      this.logger.info('Artillery MCP Server started successfully');
      this.logger.info('Server version:', SERVER_VERSION);
      this.logger.info('Artillery binary:', this.config.artilleryBin);
      this.logger.info('Working directory:', this.config.workDir);
      this.logger.info('Timeout (ms):', this.config.timeoutMs);
      this.logger.info('Max output (MB):', this.config.maxOutputMb);
      this.logger.info('Quick tests enabled:', this.config.allowQuick);
      
    } catch (error) {
      this.logger.error('Failed to start server:', error);
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
