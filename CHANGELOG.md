# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [3.0.1] - 2026-09-10

### Security

- Updated `@modelcontextprotocol/sdk` from 1.17 to 1.30, which resolves the
  advisory for cross-client data leaks via shared transport instances
  (GHSA-345p-7cg4-v4c7) and the advisories in its `body-parser`, `qs` and
  `path-to-regexp` dependencies.
- Updated dev dependencies (vitest 5, esbuild, rollup, postcss, nanoid,
  brace-expansion) so `npm audit` reports no vulnerabilities.

### Changed

- Tool registration goes through a plain call signature because the SDK's
  zod v3/v4 compatibility types are too expensive for the compiler to check
  against a non-literal schema shape.
- Vitest only discovers tests under `src/`, so compiled copies in `dist/`
  no longer run twice.
- `@types/node` moved to 22 to match the Node.js requirement.

## [3.0.0] - 2026-09-10

### Breaking

- All paths must now live inside `ARTILLERY_WORKDIR`. Absolute paths elsewhere,
  `cwd` values outside it and symlinks that escape it are rejected.
- `summary.errors` changed from the (never populated) `http.errors` counter to
  a map of `errors.*` counters. `parse_results` scenario and metadata fields
  changed to values Artillery actually emits.
- `quick_test` `count` now means total requests rather than virtual users, and
  TLS verification is on unless `insecure: true` is passed.
- Node.js 22.18 or later is required.

### Security

- Every path a tool accepts (config files, `cwd`, `outputJson`, `reportHtml`,
  results files) is now resolved against the server working directory and
  rejected if it escapes it. The check uses `path.relative` and follows
  symlinks, so `cwd: "/"`, `../`, sibling directories that share a prefix and
  symlinks pointing outside all fail.
- Artillery now runs with an explicit environment allowlist (`PATH`, `HOME`,
  proxy and TLS variables, `ARTILLERY_*`) instead of the full server
  environment. Caller-supplied `env` entries are added on top; `PATH`,
  `NODE_OPTIONS`, `LD_PRELOAD` and similar cannot be overridden.
- `quick_test` no longer skips TLS verification for every `https://` target.
  Pass `insecure: true` to opt in.

### Changed

- `quick_test` now honours `method`, `headers` and `body`. It generates a
  small Artillery script instead of calling `artillery quick`, so `count` is
  the total number of requests and `rate` plus `duration` produce a steady
  arrival rate. JSON bodies are sent as `application/json`.
- Result summaries are parsed whenever a results file exists, including when
  Artillery exits non-zero because an `ensure` threshold failed.
- `summary.errors` is now a map of Artillery `errors.*` counters (for example
  `{ "ETIMEDOUT": 12 }`) and `summary.errorsTotal` is their sum. Summaries
  also include `responsesTotal`, `httpCodes`, `vusers` and min/max/mean
  latency.
- `logsTail` includes the tail of stderr as well as stdout.
- Timeouts kill the whole Artillery process group, and a run killed by a
  signal reports a non-zero exit code with `timedOut` and `warnings` set.
- `compare_results` gates on p50, p95 and p99 latency by default. Use
  `thresholds.latencyPercentiles` to narrow this. Error rates are computed
  from the real `errors.*` counters.
- `parse_results` accepts paths relative to the working directory and derives
  scenario counts and timing from the Artillery aggregate instead of fields
  that never existed.
- Tool errors are returned with MCP `isError: true` so clients can tell
  failures apart from successful runs.
- `reportHtml` runs `artillery report` after the test. Current Artillery
  releases have removed HTML reports, in which case the result carries a
  warning instead of failing the whole run.
- `validateOnly` messages now say that nothing was executed rather than
  claiming the config was validated.
- The server version is read from `package.json` instead of a hard-coded
  string.
- Node.js 22.18 or later is required, matching current Artillery releases.

### Added

- `list_results` tool: lists JSON result files in the working directory,
  newest first.
- `quick_test` options `insecure`, `keepResults` and `outputJson`. Result
  files from quick tests are deleted after the summary is read unless one of
  the latter two is set, so they no longer accumulate.
- Smoke test that runs against a real Artillery binary when one is on
  `PATH`, and an ESLint configuration wired into CI.

### Fixed

- Inline configs are written to unique temp files, so concurrent calls cannot
  collide.
- Artillery is located by scanning `PATH` directly, so `artillery.cmd` on
  Windows is found without shelling out to `which`.
- The disabled quick test error message described the wrong environment
  variable value.
- The `server.ts` registration boilerplate was replaced by a single helper.

## [2.0.0] - 2025-12-10

### Added

- Saved configurations: `save_config`, `list_configs`, `get_config`,
  `delete_config`, `run_saved_config`.
- Interactive wizard: `wizard_start`, `wizard_step`, `wizard_finalize`.
- `run_preset_test` for smoke, baseline, soak and spike presets.
- `compare_results` for regression detection against a baseline.

## [1.0.4] - 2025-08-22

- Fixed `parse_results` when called through the MCP server.
- Corrected the inline test config format for Artillery 2.

## [1.0.0] - 2025-08-21

- Initial release with `run_test_from_file`, `run_test_inline`, `quick_test`,
  `list_capabilities` and `parse_results`.
