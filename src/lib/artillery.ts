import { spawn, SpawnOptions } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { ServerConfig, ArtilleryResult, ArtillerySummary } from '../types.js';

export class ArtilleryWrapper {
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  /**
   * Detect Artillery binary from PATH or environment
   */
  static async detectBinary(): Promise<string> {
    const envBin = process.env.ARTILLERY_BIN;
    if (envBin) {
      try {
        await fs.access(envBin);
        return envBin;
      } catch {
        throw new Error(`ARTILLERY_BIN specified but not accessible: ${envBin}`);
      }
    }

    // Try common binary names
    const binaryNames = ['artillery', 'artillery.exe'];
    for (const name of binaryNames) {
      try {
        const { execSync } = await import('child_process');
        execSync(`which ${name}`, { stdio: 'ignore' });
        return name;
      } catch {
        // Continue to next binary name
      }
    }

    throw new Error('Artillery binary not found in PATH. Please install Artillery or set ARTILLERY_BIN environment variable.');
  }

  /**
   * Get Artillery version
   */
  async getVersion(): Promise<string> {
    try {
      const result = await this.runCommand(['--version'], { timeout: 10000 });
      return result.stdout.trim();
    } catch (error) {
      throw new Error(`Failed to get Artillery version: ${error}`);
    }
  }

  /**
   * Run Artillery test from file
   */
  async runTestFromFile(
    filePath: string,
    options: {
      outputJson?: string;
      reportHtml?: string;
      env?: Record<string, string>;
      cwd?: string;
      validateOnly?: boolean;
    } = {}
  ): Promise<ArtilleryResult> {
    const startTime = Date.now();
    
    // Validate and sanitize file path
    const resolvedPath = await this.sanitizePath(filePath, options.cwd);
    
    // Build command arguments
    const args = ['run'];
    
    if (options.validateOnly) {
      args.push('--dry-run');
    }
    
    if (options.outputJson) {
      args.push('--output', options.outputJson);
    }
    
    if (options.reportHtml) {
      args.push('--report', options.reportHtml);
    }
    
    args.push(resolvedPath);

    // Run the command
    const result = await this.runCommand(args, {
      cwd: options.cwd || this.config.workDir,
      env: { ...process.env, ...options.env },
      timeout: this.config.timeoutMs
    });

    const elapsedMs = Date.now() - startTime;

    // Parse summary if JSON output was generated
    let summary: ArtillerySummary | undefined;
    if (options.outputJson && result.exitCode === 0) {
      try {
        summary = await this.parseSummary(options.outputJson);
      } catch (error) {
        // Log but don't fail the operation
        console.warn('Failed to parse summary:', error);
      }
    }

    return {
      exitCode: result.exitCode,
      elapsedMs,
      logsTail: result.stdout.slice(-2048), // Last 2KB
      jsonResultPath: options.outputJson,
      htmlReportPath: options.reportHtml,
      summary
    };
  }

  /**
   * Run Artillery test from inline config
   */
  async runTestInline(
    configText: string,
    options: {
      outputJson?: string;
      reportHtml?: string;
      env?: Record<string, string>;
      cwd?: string;
      validateOnly?: boolean;
    } = {}
  ): Promise<ArtilleryResult> {
    // Create temporary config file
    const tempDir = path.join(this.config.workDir, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const tempFile = path.join(tempDir, `config-${Date.now()}.yml`);
    
    try {
      await fs.writeFile(tempFile, configText);
      return await this.runTestFromFile(tempFile, options);
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Run quick HTTP test
   */
  async quickTest(options: {
    target: string;
    rate?: number;
    duration?: string;
    count?: number;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<ArtilleryResult> {
    if (!this.config.allowQuick) {
      throw new Error('Quick tests are disabled. Set ARTILLERY_ALLOW_QUICK=false to disable.');
    }

    // Use Artillery 2.0's quick command for simple tests
    const args = ['quick'];
    
    // Add target URL
    args.push(options.target);
    
    // Add count (number of VUs)
    if (options.count) {
      args.push('-c', options.count.toString());
    } else if (options.rate && options.duration) {
      // Estimate count based on rate and duration
      const durationSeconds = this.parseDuration(options.duration);
      const estimatedCount = Math.ceil(options.rate * durationSeconds);
      args.push('-c', estimatedCount.toString());
    } else {
      args.push('-c', '10'); // Default to 10 VUs
    }
    
    // Add number of requests per VU
    if (options.rate && options.duration) {
      const durationSeconds = this.parseDuration(options.duration);
      const vuCount = options.count || Math.ceil(options.rate * durationSeconds);
      const requestsPerVU = Math.ceil(options.rate * durationSeconds / vuCount);
      args.push('-n', requestsPerVU.toString());
    } else if (options.duration && !options.rate) {
      // If duration is specified but not rate, calculate requests to spread over duration
      const durationSeconds = this.parseDuration(options.duration);
      const requestsPerVU = Math.max(1, Math.ceil(durationSeconds / 2)); // Roughly 1 request every 2 seconds
      args.push('-n', requestsPerVU.toString());
    } else {
      args.push('-n', '30'); // Default to 30 requests per VU
    }
    
    // Add output file
    const outputFile = path.join(this.config.workDir, `quick-test-${Date.now()}.json`);
    args.push('-o', outputFile);
    
    // Add insecure flag if needed (for self-signed certs)
    if (options.target.startsWith('https://')) {
      args.push('-k');
    }
    
    // Run the quick command
    const startTime = Date.now();
    const result = await this.runCommand(args, {
      cwd: this.config.workDir,
      timeout: this.config.timeoutMs
    });
    const elapsedMs = Date.now() - startTime;
    
    // Parse summary if JSON output was generated
    let summary: ArtillerySummary | undefined;
    if (result.exitCode === 0) {
      try {
        summary = await this.parseSummary(outputFile);
      } catch (error) {
        // Log but don't fail the operation
        console.warn('Failed to parse summary:', error);
      }
    }

    return {
      exitCode: result.exitCode,
      elapsedMs,
      logsTail: result.stdout.slice(-2048), // Last 2KB
      jsonResultPath: outputFile,
      htmlReportPath: undefined,
      summary
    };
  }

  /**
   * Parse duration string to seconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])?$/);
    if (!match) return 1;
    
    const value = parseInt(match[1]);
    const unit = match[2] || 's';
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return value;
    }
  }

  /**
   * Parse Artillery JSON results
   */
  async parseResults(jsonPath: string): Promise<any> {
    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse results file: ${error}`);
    }
  }

  /**
   * Parse summary from JSON results
   */
  private async parseSummary(jsonPath: string): Promise<ArtillerySummary> {
    const results = await this.parseResults(jsonPath);
    
    // Extract metrics from Artillery 2.0 output format
    const aggregate = results.aggregate || {};
    const counters = aggregate.counters || {};
    const rates = aggregate.rates || {};
    const summaries = aggregate.summaries || {};
    
    return {
      requestsTotal: counters['http.requests'] || 0,
      rpsAvg: rates['http.request_rate'] || 0,
      latencyMs: {
        p50: summaries['http.response_time']?.p50 || 0,
        p95: summaries['http.response_time']?.p95 || 0,
        p99: summaries['http.response_time']?.p99 || 0
      },
      errors: counters['http.errors'] || {}
    };
  }

  /**
   * Run Artillery command with process management
   */
  private async runCommand(
    args: string[],
    options: SpawnOptions & { timeout?: number } = {}
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const { timeout, ...spawnOptions } = options;
      const timeoutMs = timeout || this.config.timeoutMs;

      const child = spawn(this.config.artilleryBin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...spawnOptions
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Capture output with size limits
      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length < this.config.maxOutputMb * 1024 * 1024) {
          stdout += chunk;
        }
      });

      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length < this.config.maxOutputMb * 1024 * 1024) {
          stderr += chunk;
        }
      });

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        if (!killed) {
          resolve({
            exitCode: code || 0,
            stdout,
            stderr
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * Sanitize and validate file paths
   */
  private async sanitizePath(filePath: string, cwd?: string): Promise<string> {
    const workDir = cwd || this.config.workDir;
    const resolvedPath = path.resolve(workDir, filePath);
    
    // Ensure path is within allowed working directory
    if (!resolvedPath.startsWith(path.resolve(workDir))) {
      throw new Error(`Path ${filePath} is outside allowed working directory`);
    }
    
    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }
    
    return resolvedPath;
  }
}
