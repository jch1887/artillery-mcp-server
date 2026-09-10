import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  ServerConfig,
  ArtilleryResult,
  ArtillerySummary,
  QuickTestInput,
  QuickTestResult,
  ResultFileInfo,
  RunOptions
} from '../types.js';
import { resolveExistingInside, resolveOutputInside } from './paths.js';
import { summariseResults } from './results.js';

const PASSTHROUGH_ENV = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'TEMP', 'TMP',
  'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'
]);

const BLOCKED_ENV = new Set([
  'PATH', 'NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'HOME', 'USERPROFILE',
  'COMSPEC', 'PATHEXT', 'SYSTEMROOT', 'NODE_EXTRA_CA_CERTS'
]);

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LOG_TAIL_BYTES = 2048;
const REPORT_TIMEOUT_MS = 60_000;
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const RESULTS_DIR = 'results';
const SKIP_DIRS = new Set(['node_modules', 'saved-configs', 'temp', '.git']);

interface CommandResult {
  exitCode: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface OutputPaths {
  json?: string;
  html?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Build the child environment: a fixed allowlist from the server plus caller-supplied extras. */
export function buildEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(process.env)) {
    if (PASSTHROUGH_ENV.has(key) || key.startsWith('ARTILLERY_')) env[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (!ENV_NAME.test(key)) throw new Error(`Invalid environment variable name: ${key}`);
    if (BLOCKED_ENV.has(key.toUpperCase())) throw new Error(`Environment variable ${key} cannot be overridden`);
    if (typeof value !== 'string') throw new Error(`Environment variable ${key} must be a string`);
    env[key] = value;
  }
  return env;
}

export function parseDuration(duration: string): number {
  const match = /^(\d+)\s*([smh])?$/.exec(duration.trim());
  if (!match) throw new Error(`Invalid duration "${duration}". Use a number with an optional s, m or h suffix, e.g. "30s".`);
  const value = parseInt(match[1], 10);
  const multiplier = { s: 1, m: 60, h: 3600 }[match[2] ?? 's'] ?? 1;
  const seconds = value * multiplier;
  if (seconds < 1) throw new Error('Duration must be at least one second');
  return seconds;
}

function tryParseJsonObject(text: string): unknown {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Turn quick_test inputs into a complete Artillery script. Every virtual user sends exactly one request. */
export function buildQuickTestConfig(input: QuickTestInput): Record<string, unknown> {
  let url: URL;
  try {
    url = new URL(input.target);
  } catch {
    throw new Error(`Invalid target URL: ${input.target}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Target must be an http or https URL');
  }

  const method = (input.method ?? 'GET').toLowerCase();
  if (!HTTP_METHODS.includes(method)) {
    throw new Error(`Unsupported HTTP method: ${input.method}`);
  }

  const durationSeconds = input.duration ? parseDuration(input.duration) : undefined;
  const phase: Record<string, number> = input.count
    ? { duration: durationSeconds ?? Math.max(1, Math.ceil(input.count / (input.rate ?? 10))), arrivalCount: input.count }
    : { duration: durationSeconds ?? 10, arrivalRate: input.rate ?? 10 };

  const request: Record<string, unknown> = { url: `${url.pathname}${url.search}` };
  if (input.headers && Object.keys(input.headers).length > 0) request.headers = input.headers;
  if (input.body !== undefined) {
    const json = tryParseJsonObject(input.body);
    if (json !== undefined) request.json = json;
    else request.body = input.body;
  }

  const config: Record<string, unknown> = { target: url.origin, phases: [phase] };
  if (input.insecure) config.tls = { rejectUnauthorized: false };

  return {
    config,
    scenarios: [{ name: 'quick_test', flow: [{ [method]: request }] }]
  };
}

async function isExecutable(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Locate a command on PATH without shelling out, honouring PATHEXT on Windows. */
export async function findOnPath(name: string): Promise<string | undefined> {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').map(ext => ext.toLowerCase())
    : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (await isExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    child.kill('SIGKILL');
  }
}

function tail(stdout: string, stderr: string): string {
  const parts = [stdout.slice(-LOG_TAIL_BYTES)];
  if (stderr.trim()) parts.push(`[stderr]\n${stderr.slice(-LOG_TAIL_BYTES)}`);
  return parts.join('\n');
}

export class ArtilleryWrapper {
  constructor(private readonly config: ServerConfig) {}

  static async detectBinary(): Promise<string> {
    const envBin = process.env.ARTILLERY_BIN;
    if (envBin) {
      if (!(await isExecutable(envBin))) {
        throw new Error(`ARTILLERY_BIN specified but not accessible: ${envBin}`);
      }
      return envBin;
    }
    const found = await findOnPath('artillery');
    if (found) return found;
    throw new Error('Artillery binary not found in PATH. Install Artillery or set ARTILLERY_BIN.');
  }

  async getVersion(): Promise<string> {
    const result = await this.runCommand(['--version'], { timeout: 10_000 });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get Artillery version: ${result.stderr || result.stdout}`);
    }
    return result.stdout.trim();
  }

  async runTestFromFile(filePath: string, options: RunOptions = {}): Promise<ArtilleryResult> {
    const cwd = options.cwd
      ? await resolveExistingInside(this.config.workDir, options.cwd)
      : this.config.workDir;
    const scriptPath = await resolveExistingInside(this.config.workDir, filePath, cwd);
    const outputs = await this.resolveOutputs(options, cwd);

    const args = ['run'];
    if (outputs.json) args.push('--output', outputs.json);
    args.push(scriptPath);

    return this.execute(args, { cwd, env: buildEnv(options.env) }, outputs);
  }

  async runTestInline(configText: string, options: RunOptions = {}): Promise<ArtilleryResult> {
    const tempDir = path.join(this.config.workDir, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `config-${randomUUID()}.yml`);
    await fs.writeFile(tempFile, configText, 'utf-8');
    try {
      return await this.runTestFromFile(tempFile, options);
    } finally {
      await fs.rm(tempFile, { force: true });
    }
  }

  async quickTest(input: QuickTestInput): Promise<QuickTestResult> {
    if (!this.config.allowQuick) {
      throw new Error('Quick tests are disabled because ARTILLERY_ALLOW_QUICK is set to false');
    }
    const config = buildQuickTestConfig(input);
    const outputJson = input.outputJson ?? (await this.defaultResultPath('quick-test'));
    const result = await this.runTestInline(JSON.stringify(config), { outputJson });

    if (!input.keepResults && !input.outputJson) {
      await fs.rm(outputJson, { force: true });
      result.jsonResultPath = undefined;
    }
    return { ...result, config };
  }

  async parseResults(jsonPath: string): Promise<unknown> {
    const resolved = await resolveExistingInside(this.config.workDir, jsonPath);
    let content: string;
    try {
      content = await fs.readFile(resolved, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read results file: ${errorMessage(error)}`);
    }
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse results file: ${errorMessage(error)}`);
    }
  }

  /** List JSON files under the working directory, newest first. */
  async listResults(limit = 100): Promise<ResultFileInfo[]> {
    const files: ResultFileInfo[] = [];
    const walk = async (dir: string, depth: number): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (depth < 3 && !SKIP_DIRS.has(entry.name)) await walk(full, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          const stat = await fs.stat(full);
          files.push({ path: full, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() });
        }
      }
    };
    await walk(this.config.workDir, 0);
    return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, limit);
  }

  private async defaultResultPath(prefix: string): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return resolveOutputInside(this.config.workDir, path.join(RESULTS_DIR, `${prefix}-${stamp}-${randomUUID().slice(0, 8)}.json`));
  }

  private async resolveOutputs(options: RunOptions, base: string): Promise<OutputPaths> {
    const outputs: OutputPaths = {};
    if (options.outputJson) {
      outputs.json = await resolveOutputInside(this.config.workDir, options.outputJson, base);
    }
    if (options.reportHtml) {
      outputs.html = await resolveOutputInside(this.config.workDir, options.reportHtml, base);
      outputs.json ??= await this.defaultResultPath('run');
    }
    return outputs;
  }

  private async execute(
    args: string[],
    spawnOptions: { cwd: string; env: NodeJS.ProcessEnv },
    outputs: OutputPaths
  ): Promise<ArtilleryResult> {
    const startTime = Date.now();
    const run = await this.runCommand(args, spawnOptions);
    const warnings: string[] = [];

    if (run.timedOut) {
      warnings.push(`Artillery was killed after exceeding the ${this.config.timeoutMs}ms timeout`);
    } else if (run.signal) {
      warnings.push(`Artillery was terminated by signal ${run.signal}`);
    }

    let summary: ArtillerySummary | undefined;
    if (outputs.json) {
      try {
        summary = summariseResults(await this.parseResults(outputs.json));
      } catch (error) {
        warnings.push(`No results summary: ${errorMessage(error)}`);
      }
    }

    let htmlReportPath: string | undefined;
    if (outputs.html && outputs.json && summary) {
      htmlReportPath = await this.generateHtmlReport(outputs.json, outputs.html, warnings);
    }

    return {
      exitCode: run.exitCode,
      elapsedMs: Date.now() - startTime,
      timedOut: run.timedOut || undefined,
      logsTail: tail(run.stdout, run.stderr),
      jsonResultPath: outputs.json,
      htmlReportPath,
      summary,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  private async generateHtmlReport(jsonPath: string, htmlPath: string, warnings: string[]): Promise<string | undefined> {
    const report = await this.runCommand(['report', jsonPath, '--output', htmlPath], { timeout: REPORT_TIMEOUT_MS });
    try {
      await fs.access(htmlPath);
      return htmlPath;
    } catch {
      warnings.push(
        'HTML report not generated: this Artillery version no longer supports the report command. ' +
        `JSON results are at ${jsonPath}.` + (report.stderr.trim() ? ` ${report.stderr.trim()}` : '')
      );
      return undefined;
    }
  }

  private runCommand(
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const timeoutMs = options.timeout ?? this.config.timeoutMs;
      const maxBytes = this.config.maxOutputMb * 1024 * 1024;
      const spawnOptions: SpawnOptions = {
        cwd: options.cwd ?? this.config.workDir,
        env: options.env ?? buildEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true
      };

      let child: ChildProcess;
      try {
        child = spawn(this.config.artilleryBin, args, spawnOptions);
      } catch (error) {
        reject(error);
        return;
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child);
      }, timeoutMs);

      child.stdout?.on('data', (data: Buffer) => {
        if (stdout.length < maxBytes) stdout += data.toString();
      });
      child.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < maxBytes) stderr += data.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1, signal: signal ?? null, stdout, stderr, timedOut });
      });
    });
  }
}
