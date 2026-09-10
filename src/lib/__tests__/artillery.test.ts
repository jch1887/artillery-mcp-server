import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import fsSync, { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { ArtilleryWrapper, buildEnv, buildQuickTestConfig, parseDuration } from '../artillery.js';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

interface FakeRun {
  code?: number | null;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
  results?: unknown;
  delayMs?: number;
}

const RESULTS = {
  aggregate: {
    counters: { 'http.requests': 300, 'http.responses': 298, 'http.codes.200': 298, 'errors.ETIMEDOUT': 2, 'vusers.created': 300 },
    rates: { 'http.request_rate': 5 },
    summaries: { 'http.response_time': { min: 10, max: 400, mean: 120, p50: 100, p95: 200, p99: 300 } }
  }
};

function fakeArtillery(run: FakeRun = {}) {
  vi.mocked(spawn).mockImplementation(((_cmd: string, args: string[]) => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    setTimeout(() => {
      const outputIndex = args.indexOf('--output');
      if (args[0] === 'run' && outputIndex >= 0 && run.results !== undefined) {
        fsSync.writeFileSync(args[outputIndex + 1], JSON.stringify(run.results));
      }
      if (run.stdout) child.stdout.emit('data', Buffer.from(run.stdout));
      if (run.stderr) child.stderr.emit('data', Buffer.from(run.stderr));
      child.emit('close', run.code === undefined ? 0 : run.code, run.signal ?? null);
    }, run.delayMs ?? 0);
    return child;
  }) as any);
}

function spawnArgs(callIndex = 0): string[] {
  return vi.mocked(spawn).mock.calls[callIndex][1] as string[];
}

describe('ArtilleryWrapper', () => {
  let workDir: string;
  let artillery: ArtilleryWrapper;

  beforeEach(async () => {
    workDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'artillery-mcp-')));
    artillery = new ArtilleryWrapper({
      artilleryBin: '/usr/local/bin/artillery',
      workDir,
      timeoutMs: 5000,
      maxOutputMb: 10,
      allowQuick: true
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
    delete process.env.ARTILLERY_BIN;
  });

  describe('detectBinary', () => {
    it('returns ARTILLERY_BIN when it is executable', async () => {
      const bin = path.join(workDir, 'artillery');
      await fs.writeFile(bin, '#!/bin/sh\n', { mode: 0o755 });
      process.env.ARTILLERY_BIN = bin;
      expect(await ArtilleryWrapper.detectBinary()).toBe(bin);
    });

    it('rejects an ARTILLERY_BIN that does not exist', async () => {
      process.env.ARTILLERY_BIN = path.join(workDir, 'missing');
      await expect(ArtilleryWrapper.detectBinary()).rejects.toThrow('ARTILLERY_BIN specified but not accessible');
    });
  });

  describe('buildEnv', () => {
    it('passes through only allowlisted variables', () => {
      process.env.SOME_SECRET_TOKEN = 'x';
      const env = buildEnv();
      expect(env.PATH).toBe(process.env.PATH);
      expect(env.SOME_SECRET_TOKEN).toBeUndefined();
      delete process.env.SOME_SECRET_TOKEN;
    });

    it('adds caller variables but refuses to override PATH', () => {
      expect(buildEnv({ API_KEY: 'abc' }).API_KEY).toBe('abc');
      expect(() => buildEnv({ PATH: '/evil' })).toThrow('cannot be overridden');
      expect(() => buildEnv({ node_options: '--require x' })).toThrow('cannot be overridden');
      expect(() => buildEnv({ 'BAD NAME': 'x' })).toThrow('Invalid environment variable name');
    });
  });

  describe('getVersion', () => {
    it('returns the trimmed stdout', async () => {
      fakeArtillery({ stdout: 'Artillery v2.0.34\n' });
      expect(await artillery.getVersion()).toBe('Artillery v2.0.34');
    });
  });

  describe('runTestFromFile', () => {
    it('runs a script inside the working directory and parses results', async () => {
      await fs.writeFile(path.join(workDir, 'test.yml'), 'config: {}');
      fakeArtillery({ stdout: 'done\n', results: RESULTS });

      const result = await artillery.runTestFromFile('test.yml', { outputJson: 'out/results.json' });

      expect(result.exitCode).toBe(0);
      expect(spawnArgs()).toEqual(['run', '--output', path.join(workDir, 'out', 'results.json'), path.join(workDir, 'test.yml')]);
      expect(result.jsonResultPath).toBe(path.join(workDir, 'out', 'results.json'));
      expect(result.summary?.requestsTotal).toBe(300);
      expect(result.summary?.errors).toEqual({ ETIMEDOUT: 2 });
      expect(result.summary?.errorsTotal).toBe(2);
      expect(result.summary?.httpCodes['200']).toBe(298);
    });

    it('still parses results when Artillery exits non-zero', async () => {
      await fs.writeFile(path.join(workDir, 'test.yml'), 'config: {}');
      fakeArtillery({ code: 1, stderr: 'ensure failed\n', results: RESULTS });

      const result = await artillery.runTestFromFile('test.yml', { outputJson: 'results.json' });

      expect(result.exitCode).toBe(1);
      expect(result.summary?.latencyMs.p95).toBe(200);
      expect(result.logsTail).toContain('[stderr]');
      expect(result.logsTail).toContain('ensure failed');
    });

    it('reports a non-zero exit code when killed by a signal', async () => {
      await fs.writeFile(path.join(workDir, 'test.yml'), 'config: {}');
      fakeArtillery({ code: null, signal: 'SIGKILL' });

      const result = await artillery.runTestFromFile('test.yml');

      expect(result.exitCode).toBe(1);
      expect(result.warnings?.[0]).toContain('SIGKILL');
    });

    it('flags a timeout', async () => {
      const quick = new ArtilleryWrapper({ artilleryBin: 'artillery', workDir, timeoutMs: 20, maxOutputMb: 1, allowQuick: true });
      await fs.writeFile(path.join(workDir, 'test.yml'), 'config: {}');
      fakeArtillery({ code: null, signal: 'SIGKILL', delayMs: 100 });

      const result = await quick.runTestFromFile('test.yml');

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).toBe(1);
      expect(result.warnings?.[0]).toContain('timeout');
    });

    it('passes caller env on top of the allowlist', async () => {
      await fs.writeFile(path.join(workDir, 'test.yml'), 'config: {}');
      fakeArtillery();

      await artillery.runTestFromFile('test.yml', { env: { TOKEN: 'abc' } });

      const options = vi.mocked(spawn).mock.calls[0][2] as { env: Record<string, string> };
      expect(options.env.TOKEN).toBe('abc');
      expect(options.env.PATH).toBe(process.env.PATH);
    });

    it('rejects paths outside the working directory', async () => {
      await expect(artillery.runTestFromFile('/etc/passwd')).rejects.toThrow('outside the working directory');
      await expect(artillery.runTestFromFile('../escape.yml')).rejects.toThrow('outside the working directory');
    });

    it('rejects a sibling directory that shares the prefix', async () => {
      const sibling = `${workDir}-evil`;
      await fs.mkdir(sibling);
      await fs.writeFile(path.join(sibling, 'test.yml'), 'config: {}');
      try {
        await expect(artillery.runTestFromFile(path.join(sibling, 'test.yml'))).rejects.toThrow('outside the working directory');
      } finally {
        await fs.rm(sibling, { recursive: true, force: true });
      }
    });

    it('rejects a cwd outside the working directory', async () => {
      await fs.writeFile(path.join(workDir, 'test.yml'), 'config: {}');
      await expect(artillery.runTestFromFile('test.yml', { cwd: '/' })).rejects.toThrow('outside the working directory');
    });

    it('rejects output paths outside the working directory', async () => {
      await fs.writeFile(path.join(workDir, 'test.yml'), 'config: {}');
      await expect(artillery.runTestFromFile('test.yml', { outputJson: '/tmp/anywhere.json' })).rejects.toThrow('outside the working directory');
      await expect(artillery.runTestFromFile('test.yml', { reportHtml: '../report.html' })).rejects.toThrow('outside the working directory');
    });

    it('rejects a symlink that points outside the working directory', async () => {
      const outside = path.join(os.tmpdir(), `outside-${Date.now()}.yml`);
      await fs.writeFile(outside, 'config: {}');
      await fs.symlink(outside, path.join(workDir, 'link.yml'));
      try {
        await expect(artillery.runTestFromFile('link.yml')).rejects.toThrow('outside the working directory');
      } finally {
        await fs.rm(outside, { force: true });
      }
    });

    it('warns when an HTML report was requested but not produced', async () => {
      await fs.writeFile(path.join(workDir, 'test.yml'), 'config: {}');
      fakeArtillery({ results: RESULTS });

      const result = await artillery.runTestFromFile('test.yml', { reportHtml: 'report.html' });

      expect(spawnArgs(1).slice(0, 2)).toEqual(['report', result.jsonResultPath]);
      expect(result.htmlReportPath).toBeUndefined();
      expect(result.warnings?.some(w => w.includes('HTML report not generated'))).toBe(true);
    });
  });

  describe('runTestInline', () => {
    it('writes a unique temp file and removes it afterwards', async () => {
      fakeArtillery();
      await Promise.all([
        artillery.runTestInline('config: {}'),
        artillery.runTestInline('config: {}')
      ]);
      const [first, second] = [spawnArgs(0).at(-1), spawnArgs(1).at(-1)];
      expect(first).not.toBe(second);
      expect(first).toContain(path.join(workDir, 'temp'));
      await expect(fs.readdir(path.join(workDir, 'temp'))).resolves.toEqual([]);
    });
  });

  describe('quickTest', () => {
    it('throws when quick tests are disabled', async () => {
      const disabled = new ArtilleryWrapper({ artilleryBin: 'artillery', workDir, timeoutMs: 1000, maxOutputMb: 1, allowQuick: false });
      await expect(disabled.quickTest({ target: 'http://example.com' })).rejects.toThrow('ARTILLERY_ALLOW_QUICK is set to false');
    });

    it('runs the generated script and removes the results file by default', async () => {
      fakeArtillery({ results: RESULTS });

      const result = await artillery.quickTest({ target: 'http://example.com/health', count: 300 });

      expect(spawnArgs()[0]).toBe('run');
      expect(spawnArgs()).not.toContain('-k');
      expect(result.summary?.requestsTotal).toBe(300);
      expect(result.jsonResultPath).toBeUndefined();
      expect(result.config).toMatchObject({ config: { target: 'http://example.com' } });
      await expect(fs.readdir(path.join(workDir, 'results'))).resolves.toEqual([]);
    });

    it('keeps the results file when asked', async () => {
      fakeArtillery({ results: RESULTS });
      const result = await artillery.quickTest({ target: 'http://example.com', keepResults: true });
      expect(result.jsonResultPath).toBeDefined();
      await expect(fs.access(result.jsonResultPath!)).resolves.toBeUndefined();
    });
  });

  describe('buildQuickTestConfig', () => {
    it('honours method, headers and a JSON body', () => {
      const script = buildQuickTestConfig({
        target: 'https://api.example.com/items?x=1',
        method: 'POST',
        headers: { Authorization: 'Bearer t' },
        body: '{"a":1}'
      }) as any;
      expect(script.config.target).toBe('https://api.example.com');
      expect(script.config.tls).toBeUndefined();
      expect(script.scenarios[0].flow[0]).toEqual({
        post: { url: '/items?x=1', headers: { Authorization: 'Bearer t' }, json: { a: 1 } }
      });
    });

    it('sends a non-JSON body as a raw string', () => {
      const script = buildQuickTestConfig({ target: 'http://h/', method: 'put', body: 'plain' }) as any;
      expect(script.scenarios[0].flow[0]).toEqual({ put: { url: '/', body: 'plain' } });
    });

    it('treats count as the total number of requests', () => {
      const script = buildQuickTestConfig({ target: 'http://h/', count: 50 }) as any;
      expect(script.config.phases).toEqual([{ duration: 5, arrivalCount: 50 }]);
    });

    it('uses rate and duration as arrivalRate over the phase', () => {
      const script = buildQuickTestConfig({ target: 'http://h/', rate: 10, duration: '30s' }) as any;
      expect(script.config.phases).toEqual([{ duration: 30, arrivalRate: 10 }]);
    });

    it('only disables TLS verification when asked', () => {
      const script = buildQuickTestConfig({ target: 'https://h/', insecure: true }) as any;
      expect(script.config.tls).toEqual({ rejectUnauthorized: false });
    });

    it('rejects bad input', () => {
      expect(() => buildQuickTestConfig({ target: 'not a url' })).toThrow('Invalid target URL');
      expect(() => buildQuickTestConfig({ target: 'ftp://h/' })).toThrow('http or https');
      expect(() => buildQuickTestConfig({ target: 'http://h/', method: 'BREW' })).toThrow('Unsupported HTTP method');
      expect(() => buildQuickTestConfig({ target: 'http://h/', duration: 'soon' })).toThrow('Invalid duration');
    });
  });

  describe('parseDuration', () => {
    it('parses seconds, minutes and hours', () => {
      expect(parseDuration('45')).toBe(45);
      expect(parseDuration('30s')).toBe(30);
      expect(parseDuration('2m')).toBe(120);
      expect(parseDuration('1h')).toBe(3600);
    });
  });

  describe('parseResults', () => {
    it('parses a results file inside the working directory', async () => {
      await fs.writeFile(path.join(workDir, 'r.json'), JSON.stringify(RESULTS));
      expect(await artillery.parseResults('r.json')).toEqual(RESULTS);
    });

    it('rejects files outside the working directory', async () => {
      await expect(artillery.parseResults('/etc/hosts')).rejects.toThrow('outside the working directory');
    });

    it('reports invalid JSON', async () => {
      await fs.writeFile(path.join(workDir, 'bad.json'), 'nope');
      await expect(artillery.parseResults('bad.json')).rejects.toThrow('Failed to parse results file');
    });
  });

  describe('listResults', () => {
    it('lists JSON files newest first and skips internal directories', async () => {
      await fs.mkdir(path.join(workDir, 'results'));
      await fs.mkdir(path.join(workDir, 'saved-configs'));
      await fs.writeFile(path.join(workDir, 'saved-configs', 'index.json'), '{}');
      await fs.writeFile(path.join(workDir, 'results', 'a.json'), '{}');
      await fs.writeFile(path.join(workDir, 'b.json'), '{}');
      await fs.utimes(path.join(workDir, 'b.json'), new Date(0), new Date(0));

      const files = await artillery.listResults();

      expect(files.map(f => path.basename(f.path))).toEqual(['a.json', 'b.json']);
      expect(files[0].sizeBytes).toBe(2);
    });
  });
});
