import { MCPTool, ToolOutput, ServerCapabilities } from '../types.js';
import { ArtilleryWrapper } from '../lib/artillery.js';

export class ListCapabilitiesTool implements MCPTool {
  readonly name = 'list_capabilities';
  readonly description = 'Report versions, detected features, and server limits.';
  readonly inputSchema = { 
    type: 'object', 
    properties: {} 
  };

  constructor(
    private artillery: ArtilleryWrapper,
    private config: any,
    private serverVersion: string
  ) {}

  async call(request: any): Promise<ToolOutput<ServerCapabilities>> {
    try {
      // Get Artillery version
      const artilleryVersion = await this.artillery.getVersion();

      const capabilities: ServerCapabilities = {
        artilleryVersion,
        serverVersion: this.serverVersion,
        transports: ['stdio'],
        limits: {
          maxTimeoutMs: this.config.timeoutMs,
          maxOutputMb: this.config.maxOutputMb,
          allowQuick: this.config.allowQuick
        },
        configPaths: {
          workDir: this.config.workDir,
          artilleryBin: this.config.artilleryBin
        }
      };

      return {
        status: 'ok',
        tool: this.name,
        data: capabilities
      };

    } catch (error) {
      return {
        status: 'error',
        tool: this.name,
        error: {
          code: 'CAPABILITIES_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: {
            tool: this.name
          }
        }
      };
    }
  }
}
