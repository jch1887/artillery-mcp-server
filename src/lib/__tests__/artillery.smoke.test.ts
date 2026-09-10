import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { ArtilleryWrapper, findOnPath } from '../artillery.js';

const artilleryBin = process.env.ARTILLERY_BIN ?? (await findOnPath('artillery'));

interface SeenRequest {
  method: string;
  url: string;
  header?: string;
  body: string;
}

describe.skipIf(!artilleryBin)('Artillery smoke test (real binary)', () => {
  const seen: SeenRequest[] = [];
  let server: http.Server;
  let target: string;
  let workDir: string;
  let artillery: ArtilleryWrapper;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        seen.push({ method: req.method ?? '', url: req.url ?? '', header: req.headers['x-smoke'] as string | undefined, body });
        res.setHeader('content-type', 'application/json');
        res.end('{"ok":true}');
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    target = `http://127.0.0.1:${address.port}`;

    workDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'artillery-smoke-')));
    artillery = new ArtilleryWrapper({ artilleryBin: artilleryBin!, workDir, timeoutMs: 120_000, maxOutputMb: 10, allowQuick: true });
  });

  afterAll(async () => {
    server?.close();
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
  });

  it('reports the Artillery version', async () => {
    expect(await artillery.getVersion()).toMatch(/\d+\.\d+\.\d+/);
  }, 60_000);

  it('quick_test honours method, headers, body and count', async () => {
    seen.length = 0;
    const result = await artillery.quickTest({
      target: `${target}/items?x=1`,
      method: 'POST',
      headers: { 'x-smoke': 'yes' },
      body: '{"hello":"world"}',
      count: 3,
      duration: '1s'
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary?.requestsTotal).toBe(3);
    expect(result.summary?.httpCodes['200']).toBe(3);
    expect(result.summary?.errorsTotal).toBe(0);
    expect(result.jsonResultPath).toBeUndefined();
    expect(seen).toHaveLength(3);
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/items?x=1', header: 'yes' });
    expect(JSON.parse(seen[0].body)).toEqual({ hello: 'world' });
  }, 90_000);

  it('parses results when ensure thresholds make Artillery exit non-zero', async () => {
    const config = {
      config: {
        target,
        plugins: { ensure: {} },
        ensure: { thresholds: [{ 'http.response_time.p95': 0 }] },
        phases: [{ duration: 1, arrivalCount: 2 }]
      },
      scenarios: [{ flow: [{ get: { url: '/' } }] }]
    };

    const result = await artillery.runTestInline(JSON.stringify(config), { outputJson: 'ensure.json', reportHtml: 'ensure.html' });

    expect(result.exitCode).not.toBe(0);
    expect(result.summary?.requestsTotal).toBe(2);
    expect(result.jsonResultPath).toBe(path.join(workDir, 'ensure.json'));
    expect(result.htmlReportPath !== undefined || result.warnings?.some(w => w.includes('HTML report not generated'))).toBe(true);

    const files = await artillery.listResults();
    expect(files.some(f => f.path.endsWith('ensure.json'))).toBe(true);
  }, 90_000);

  it('kills a run that exceeds the timeout', async () => {
    const slow = new ArtilleryWrapper({ artilleryBin: artilleryBin!, workDir, timeoutMs: 8_000, maxOutputMb: 10, allowQuick: true });
    const config = {
      config: { target, phases: [{ duration: 60, arrivalRate: 1 }] },
      scenarios: [{ flow: [{ get: { url: '/' } }] }]
    };

    const started = Date.now();
    const result = await slow.runTestInline(JSON.stringify(config));

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(30_000);
  }, 60_000);
});
