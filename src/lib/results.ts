import { ArtillerySummary, ParsedResults, ScenarioStats } from '../types.js';

type Aggregate = {
  counters?: Record<string, number>;
  rates?: Record<string, number>;
  summaries?: Record<string, Record<string, number>>;
  firstCounterAt?: number;
  lastCounterAt?: number;
};

function aggregateOf(results: unknown): Aggregate {
  const root = (results ?? {}) as { aggregate?: Aggregate };
  return root.aggregate ?? {};
}

function collectPrefixed(counters: Record<string, number>, prefix: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(counters)) {
    if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
  }
  return out;
}

/** Build the summary the tools return from a raw Artillery results document. */
export function summariseResults(results: unknown): ArtillerySummary {
  const aggregate = aggregateOf(results);
  const counters = aggregate.counters ?? {};
  const rates = aggregate.rates ?? {};
  const latency = aggregate.summaries?.['http.response_time'] ?? {};
  const errors = collectPrefixed(counters, 'errors.');

  return {
    requestsTotal: counters['http.requests'] ?? 0,
    responsesTotal: counters['http.responses'] ?? 0,
    rpsAvg: rates['http.request_rate'] ?? 0,
    latencyMs: {
      min: latency.min ?? 0,
      max: latency.max ?? 0,
      mean: latency.mean ?? 0,
      p50: latency.p50 ?? latency.median ?? 0,
      p95: latency.p95 ?? 0,
      p99: latency.p99 ?? 0
    },
    httpCodes: collectPrefixed(counters, 'http.codes.'),
    errors,
    errorsTotal: Object.values(errors).reduce((sum, n) => sum + n, 0),
    vusers: {
      created: counters['vusers.created'] ?? 0,
      completed: counters['vusers.completed'] ?? 0,
      failed: counters['vusers.failed'] ?? 0
    }
  };
}

export function parseResultsDocument(results: unknown): ParsedResults {
  const aggregate = aggregateOf(results);
  const counters = aggregate.counters ?? {};
  const summary = summariseResults(results);

  const scenarios: ScenarioStats[] = Object.entries(collectPrefixed(counters, 'vusers.created_by_name.'))
    .map(([name, count]) => ({ name, count }));

  const startedAt = aggregate.firstCounterAt;
  const finishedAt = aggregate.lastCounterAt;

  return {
    summary,
    scenarios,
    metadata: {
      startedAt: startedAt ? new Date(startedAt).toISOString() : undefined,
      finishedAt: finishedAt ? new Date(finishedAt).toISOString() : undefined,
      durationMs: startedAt && finishedAt ? finishedAt - startedAt : undefined,
      totalRequests: summary.requestsTotal
    }
  };
}
