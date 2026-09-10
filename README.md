# Artillery MCP Server

A Model Context Protocol (MCP) server that exposes tools for running and inspecting Artillery load tests from MCP-compatible clients such as Claude Desktop and Cursor. See the [changelog](CHANGELOG.md) for what changed in each release.

## Features

- **Sandboxed Execution**: Only the Artillery CLI is run, every path stays inside the working directory, and the child environment is an explicit allowlist
- **Multiple Test Modes**: Run tests from files, inline configs, or quick HTTP tests
- **Saved Configurations**: Save, manage, and reuse Artillery test configs by name
- **Interactive Wizard**: Step-by-step guided test building with preset test types
- **Preset Tests**: Run smoke/baseline/soak/spike tests with minimal configuration
- **Regression Detection**: Compare test results against baseline with configurable thresholds
- **Structured Output**: JSON results, parsed summaries, and a listing of past result files
- **Timeouts and Limits**: Runs are killed (including worker processes) when they exceed the timeout, and captured output is capped

## Prerequisites

- Node.js 22.18 or later (required by current Artillery releases)
- Artillery CLI installed and accessible via PATH
- MCP-compatible client (Claude Desktop, Cursor, etc.)

## Installation

### Option 1: Install from npm (Recommended)

```bash
# Install globally
npm install -g @jch1887/artillery-mcp-server

# Or use npx (no installation needed)
npx @jch1887/artillery-mcp-server

# Verify installation
artillery-mcp-server --version
```

### Option 2: Install Artillery CLI

```bash
# Using npm
npm install -g artillery

# Using yarn
yarn global add artillery

# Verify installation
artillery --version
```

### Option 3: Install Artillery MCP Server from source

```bash
# Clone the repository
git clone https://github.com/jch1887/artillery-mcp-server.git
cd artillery-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Run the server
npm start
```

## Configuration

The server can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ARTILLERY_BIN` | Auto-detected | Path to Artillery binary |
| `ARTILLERY_WORKDIR` | Current directory | Working directory for tests |
| `ARTILLERY_TIMEOUT_MS` | 1800000 (30 min) | Maximum test execution time |
| `ARTILLERY_MAX_OUTPUT_MB` | 10 | Maximum output capture size |
| `ARTILLERY_ALLOW_QUICK` | true | Enable quick HTTP tests (set to 'false' to disable) |
| `DEBUG` | (none) | Enable debug logging (e.g., `artillery:mcp:*`) |

### Example Configuration

```bash
export ARTILLERY_WORKDIR="/path/to/test/configs"
export ARTILLERY_TIMEOUT_MS=900000  # 15 minutes
export ARTILLERY_MAX_OUTPUT_MB=50   # 50MB output limit
export ARTILLERY_ALLOW_QUICK=true   # Enable quick tests
export DEBUG=artillery:mcp:*        # Enable debug logging
```

## Usage

### Global Installation

```bash
# Start the server
artillery-mcp-server

# With custom configuration
ARTILLERY_WORKDIR="/path/to/tests" artillery-mcp-server
```

### npx Usage (No Installation)

```bash
# Run directly without installing
npx @jch1887/artillery-mcp-server

# With custom configuration
ARTILLERY_WORKDIR="/path/to/tests" npx @jch1887/artillery-mcp-server
```

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests once
npm run test:run
```

## MCP Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "artillery": {
      "command": "artillery-mcp-server",
      "env": {
        "ARTILLERY_WORKDIR": "/path/to/test/configs",
        "ARTILLERY_ALLOW_QUICK": "true"
      }
    }
  }
}
```

### Cursor

Add to your Cursor settings:

```json
{
  "mcp.servers": {
    "artillery": {
      "command": "artillery-mcp-server",
      "env": {
        "ARTILLERY_WORKDIR": "/path/to/test/configs"
      }
    }
  }
}
```

### Generic MCP Client

```json
{
  "mcpServers": {
    "artillery": {
      "command": "artillery-mcp-server",
      "env": {
        "ARTILLERY_WORKDIR": "/path/to/test/configs"
      }
    }
  }
}
```

## Available Tools

### 1. `run_test_from_file`

Run an Artillery test from a config file.

All paths are resolved against `ARTILLERY_WORKDIR` and must stay inside it.

**Parameters:**
- `path` (required): Path to Artillery config file
- `outputJson` (optional): Path for JSON results output
- `reportHtml` (optional): Path for HTML report output (see the note below)
- `env` (optional): Extra environment variables. `PATH`, `NODE_OPTIONS` and similar cannot be overridden
- `cwd` (optional): Directory to run from, inside the working directory
- `validateOnly` (optional): Return without running. Artillery has no validation mode, so the config is not checked

**Example:**
```json
{
  "path": "tests/api.yml",
  "outputJson": "results/api.json"
}
```

**Note on HTML reports:** recent Artillery releases have removed the `report` command. When `reportHtml` is set the server still tries it after the run and, if no file appears, returns the JSON path with a warning instead of failing.

### 2. `run_test_inline`

Run an Artillery test from inline configuration.

**Note:** Artillery 2.0+ requires using `flow` instead of `requests` in scenarios. See the example below for the correct format.

**Parameters:**
- `configText` (required): Artillery config as YAML/JSON string
- `outputJson` (optional): Path for JSON results output
- `reportHtml` (optional): Path for HTML report output
- `env` (optional): Extra environment variables
- `cwd` (optional): Directory to run from, inside the working directory
- `validateOnly` (optional): Return without running

**Example:**
```yaml
# Artillery 2.0 Configuration Format
configText: |
  config:
    target: 'https://sighthoundnoir.co.uk'
    phases:
      - duration: 60
        arrivalCount: 3
    defaults:
      headers:
        User-Agent: 'Artillery-MCP-Server/3.0.0'
  
  scenarios:
    - name: "Load Test"
      flow:
        - get:
            url: /
        - think: 1
        - get:
            url: /
        - think: 1
        - get:
            url: /
```

### 3. `quick_test`

Run a quick HTTP test without writing a config. The server generates a one-request scenario, so `count` is the exact number of requests sent, and `rate` with `duration` gives a steady arrival rate. The generated script is returned as `config` alongside the usual result.

**Parameters:**
- `target` (required): URL to test
- `rate` (optional): Requests per second (default 10, ignored when `count` is set)
- `duration` (optional): Test duration such as "30s" or "1m" (default 10s)
- `count` (optional): Total number of requests to send
- `method` (optional): HTTP method (default: GET)
- `headers` (optional): HTTP headers
- `body` (optional): Request body. JSON text is sent as `application/json`
- `insecure` (optional): Skip TLS certificate verification (default false)
- `keepResults` (optional): Keep the JSON results file (default false)
- `outputJson` (optional): Write results to this path instead of an auto-generated one

**Example:**
```json
{
  "target": "https://api.example.com/items",
  "method": "POST",
  "headers": { "Authorization": "Bearer token" },
  "body": "{\"name\": \"demo\"}",
  "count": 50,
  "duration": "10s"
}
```

### 4. `list_capabilities`

Report server capabilities and configuration.

**Parameters:** None

**Returns:**
```json
{
  "artilleryVersion": "2.0.34",
  "serverVersion": "3.0.0",
  "transports": ["stdio"],
  "limits": {
    "maxTimeoutMs": 1800000,
    "maxOutputMb": 10,
    "allowQuick": true
  },
  "configPaths": {
    "workDir": "/path/to/workdir",
    "artilleryBin": "/usr/local/bin/artillery"
  }
}
```

### 5. `parse_results`

Parse and summarise Artillery JSON results.

**Parameters:**
- `jsonPath` (required): Path to the results file, inside the working directory

**Example:**
```json
{
  "jsonPath": "results/api.json"
}
```

**Returns:**
```json
{
  "summary": {
    "requestsTotal": 150,
    "responsesTotal": 148,
    "rpsAvg": 4.6,
    "latencyMs": { "min": 12, "max": 410, "mean": 90, "p50": 85, "p95": 120, "p99": 180 },
    "httpCodes": { "200": 148 },
    "errors": { "ETIMEDOUT": 2 },
    "errorsTotal": 2,
    "vusers": { "created": 150, "completed": 148, "failed": 2 }
  },
  "scenarios": [{ "name": "Smoke Test", "count": 150 }],
  "metadata": { "startedAt": "2025-01-21T10:00:00.000Z", "finishedAt": "2025-01-21T10:00:32.000Z", "durationMs": 32000, "totalRequests": 150 }
}
```

### 6. `list_results`

List JSON result files under the working directory, newest first.

**Parameters:**
- `limit` (optional): Maximum number of files to return (default 100)

**Returns:**
```json
{
  "count": 1,
  "results": [{ "path": "/path/to/workdir/results/api.json", "sizeBytes": 20480, "modifiedAt": "2025-01-21T10:00:32.000Z" }]
}
```

---

## Saved Configurations

The server supports saving and managing reusable Artillery configurations. Saved configs are stored in `$ARTILLERY_WORKDIR/saved-configs/` and can be referenced by name.

### 7. `save_config`

Save a new Artillery configuration or update an existing one.

**Parameters:**
- `name` (required): Unique name for the config (alphanumeric, hyphens, underscores)
- `content` (required): Artillery configuration as YAML or JSON string
- `description` (optional): Description of what this config tests
- `tags` (optional): Array of tags for organisation (e.g., `["smoke", "api"]`)

**Example:**
```json
{
  "name": "api-smoke-test",
  "content": "config:\n  target: 'https://api.example.com'\n  phases:\n    - duration: 30\n      arrivalRate: 5\nscenarios:\n  - name: 'Smoke Test'\n    flow:\n      - get:\n          url: '/health'",
  "description": "Quick smoke test for API health endpoint",
  "tags": ["smoke", "api"]
}
```

**Returns:**
```json
{
  "status": "ok",
  "tool": "save_config",
  "data": {
    "name": "api-smoke-test",
    "description": "Quick smoke test for API health endpoint",
    "createdAt": "2025-01-21T10:00:00.000Z",
    "updatedAt": "2025-01-21T10:00:00.000Z",
    "filename": "api-smoke-test.yml",
    "tags": ["smoke", "api"]
  }
}
```

### 8. `list_configs`

List all saved Artillery configurations.

**Parameters:**
- `tag` (optional): Filter configs by tag

**Example:**
```json
{
  "tag": "smoke"
}
```

**Returns:**
```json
{
  "status": "ok",
  "tool": "list_configs",
  "data": {
    "count": 2,
    "configs": [
      {
        "name": "api-smoke-test",
        "description": "Quick smoke test",
        "createdAt": "2025-01-21T10:00:00.000Z",
        "updatedAt": "2025-01-21T10:00:00.000Z",
        "filename": "api-smoke-test.yml",
        "tags": ["smoke", "api"]
      }
    ]
  }
}
```

### 9. `get_config`

Retrieve a saved Artillery configuration by name.

**Parameters:**
- `name` (required): Name of the config to retrieve

**Example:**
```json
{
  "name": "api-smoke-test"
}
```

**Returns:**
```json
{
  "status": "ok",
  "tool": "get_config",
  "data": {
    "entry": {
      "name": "api-smoke-test",
      "filename": "api-smoke-test.yml"
    },
    "content": "config:\n  target: 'https://api.example.com'\n..."
  }
}
```

### 10. `delete_config`

Delete a saved Artillery configuration.

**Parameters:**
- `name` (required): Name of the config to delete

**Example:**
```json
{
  "name": "old-config"
}
```

**Returns:**
```json
{
  "status": "ok",
  "tool": "delete_config",
  "data": {
    "deleted": true,
    "name": "old-config"
  }
}
```

### 11. `run_saved_config`

Run an Artillery test using a previously saved configuration.

**Parameters:**
- `name` (required): Name of the saved config to run
- `outputJson` (optional): Path for JSON results output
- `reportHtml` (optional): Path for HTML report output
- `env` (optional): Environment variables to pass to Artillery
- `validateOnly` (optional): If true, only validate the config without running

**Example:**
```json
{
  "name": "api-smoke-test",
  "outputJson": "/path/to/results.json",
  "env": {
    "API_KEY": "your-api-key"
  }
}
```

**Returns:**
```json
{
  "status": "ok",
  "tool": "run_saved_config",
  "data": {
    "exitCode": 0,
    "elapsedMs": 32500,
    "logsTail": "...test output...",
    "jsonResultPath": "/path/to/results.json",
    "summary": {
      "requestsTotal": 150,
      "responsesTotal": 150,
      "rpsAvg": 4.6,
      "latencyMs": { "min": 12, "max": 410, "mean": 90, "p50": 85, "p95": 120, "p99": 180 },
      "httpCodes": { "200": 150 },
      "errors": {},
      "errorsTotal": 0,
      "vusers": { "created": 150, "completed": 150, "failed": 0 }
    }
  }
}
```

### Saved Config Workflow Example

```
1. Save a config:
   save_config(name="baseline", content="...", tags=["baseline"])

2. List configs:
   list_configs() → shows all saved configs

3. Run the saved config:
   run_saved_config(name="baseline", outputJson="./results.json")

4. Update the config:
   save_config(name="baseline", content="...updated...", tags=["baseline"])

5. Clean up:
   delete_config(name="baseline")
```

---

## Interactive Wizard

The server provides an interactive wizard to help build Artillery test configurations step-by-step. The wizard state is fully serializable, making it easy for AI agents to drive.

### 12. `wizard_start`

Start a new wizard session.

**Parameters:**
- `fromSavedConfig` (optional): Name of a saved config to use as starting point

**Example:**
```json
{
  "fromSavedConfig": "my-existing-config"
}
```

**Returns:**
```json
{
  "status": "ok",
  "tool": "wizard_start",
  "data": {
    "state": { "currentStep": "target", "data": {}, "errors": [], "isComplete": false },
    "stepInfo": { "title": "Target URL", "description": "...", "stepNumber": 1 },
    "nextAction": {
      "description": "Call wizard_step with action 'set_target' and your target URL",
      "example": { "action": "set_target", "value": "https://api.example.com" }
    }
  }
}
```

### 13. `wizard_step`

Advance the wizard based on user input.

**Parameters:**
- `state` (required): The current wizard state (from wizard_start or previous wizard_step)
- `action` (required): The action to perform
- `value` (required): The value for the action

**Actions by Step:**

| Step | Actions | Value |
|------|---------|-------|
| target | `set_target` | URL string |
| test_type | `set_test_type` | `smoke`, `baseline`, `soak`, `spike`, or `custom` |
| load_profile | `set_load_profile` | `{ phases: [...] }` |
| scenarios | `set_scenarios` | `{ requests: [...], scenarioName?: string }` |
| review | `confirm`, `save_as`, `go_back` | `true` or `{ configName, description }` |

**Example - Set Target:**
```json
{
  "state": { "...wizard state from previous call..." },
  "action": "set_target",
  "value": "https://api.example.com"
}
```

**Example - Set Test Type:**
```json
{
  "state": { "...wizard state..." },
  "action": "set_test_type",
  "value": "smoke"
}
```

**Example - Set Scenarios:**
```json
{
  "state": { "...wizard state..." },
  "action": "set_scenarios",
  "value": {
    "requests": [
      { "method": "GET", "url": "/api/health" },
      { "method": "POST", "url": "/api/data", "body": { "key": "value" } }
    ],
    "scenarioName": "API Test"
  }
}
```

### 14. `wizard_finalize`

Generate the final config and optionally save/run it.

**Parameters:**
- `state` (required): The completed wizard state
- `runImmediately` (optional): If true, run the test immediately
- `outputJson` (optional): Path for JSON results output
- `reportHtml` (optional): Path for HTML report output

**Example:**
```json
{
  "state": { "...completed wizard state..." },
  "runImmediately": true,
  "outputJson": "/path/to/results.json"
}
```

**Returns:**
```json
{
  "status": "ok",
  "tool": "wizard_finalize",
  "data": {
    "config": {
      "configYaml": "config:\\n  target: 'https://api.example.com'...",
      "summary": {
        "target": "https://api.example.com",
        "testType": "smoke",
        "totalDuration": 30,
        "scenarioName": "API Test",
        "requestCount": 2
      }
    },
    "savedAs": "my-config",
    "testResult": { "exitCode": 0, "elapsedMs": 32000, "..." }
  }
}
```

### Wizard Test Types

| Type | Description | Duration | Rate |
|------|-------------|----------|------|
| `smoke` | Quick functionality check | 30s | 1 req/s |
| `baseline` | Performance baseline | 2min | 5→10→5 req/s |
| `soak` | Extended steady load | 10min | 5 req/s |
| `spike` | Sudden traffic surge | 100s | 5→50→5 req/s |
| `custom` | User-defined | - | - |

### Complete Wizard Flow Example

```
1. Start wizard:
   wizard_start()
   → Returns state at "target" step

2. Set target URL:
   wizard_step(state, action="set_target", value="https://api.example.com")
   → Returns state at "test_type" step

3. Choose test type:
   wizard_step(state, action="set_test_type", value="smoke")
   → Returns state at "scenarios" step (smoke preset applied)

4. Define scenarios:
   wizard_step(state, action="set_scenarios", value={
     requests: [{ method: "GET", url: "/health" }],
     scenarioName: "Health Check"
   })
   → Returns state at "review" step

5. Confirm and generate:
   wizard_step(state, action="confirm", value=true)
   → Returns completed state

6. Finalize:
   wizard_finalize(state, runImmediately=true)
   → Returns generated config and test results
```

---

## Advanced Testing

The server provides tools for streamlined testing and regression detection.

### 15. `run_preset_test`

Run a preset test type with minimal configuration - just provide a target URL and preset type.

**Parameters:**
- `target` (required): Target URL to test
- `preset` (required): Test type - `smoke`, `baseline`, `soak`, or `spike`
- `path` (optional): Endpoint path (default: `/`)
- `method` (optional): HTTP method (default: `GET`)
- `body` (optional): Request body for POST/PUT
- `outputJson` (optional): Path for JSON results
- `reportHtml` (optional): Path for HTML report
- `env` (optional): Environment variables

**Example - Quick Smoke Test:**
```json
{
  "target": "https://api.example.com",
  "preset": "smoke"
}
```

**Example - Baseline Test with Custom Endpoint:**
```json
{
  "target": "https://api.example.com",
  "preset": "baseline",
  "path": "/api/v1/users",
  "outputJson": "/results/baseline-2025-01-21.json"
}
```

**Returns:**
```json
{
  "status": "ok",
  "tool": "run_preset_test",
  "data": {
    "exitCode": 0,
    "elapsedMs": 32500,
    "preset": {
      "name": "Smoke Test",
      "description": "Quick test with low volume to verify functionality",
      "type": "smoke"
    },
    "configYaml": "...",
    "summary": { "requestsTotal": 30, "rpsAvg": 1.0, "..." }
  }
}
```

### 16. `compare_results`

Compare two Artillery test results to detect performance regressions.

**Parameters:**
- `baselinePath` (required): Path to baseline (reference) JSON results
- `currentPath` (required): Path to current (new) JSON results
- `thresholds` (optional): Custom thresholds for pass/fail
  - `maxLatencyIncrease`: Max latency increase (default: 0.2 = 20%)
  - `maxErrorRateIncrease`: Max error rate increase (default: 0.01 = 1%)
  - `minThroughputRatio`: Min throughput as ratio of baseline (default: 0.9 = 90%)
  - `latencyPercentiles`: Which of `p50`, `p95`, `p99` the latency threshold applies to (default: all three)

Error rates are computed from Artillery's `errors.*` counters divided by total requests.

**Example:**
```json
{
  "baselinePath": "results/baseline.json",
  "currentPath": "results/current.json",
  "thresholds": {
    "maxLatencyIncrease": 0.1,
    "minThroughputRatio": 0.95
  }
}
```

**Returns:**
```json
{
  "status": "ok",
  "tool": "compare_results",
  "data": {
    "passed": false,
    "summary": "❌ FAILED - 1 threshold(s) exceeded",
    "latency": {
      "p50": { "baseline": 100, "current": 120, "changePercent": 20, "status": "degraded" },
      "p95": { "baseline": 200, "current": 280, "changePercent": 40, "status": "degraded" },
      "p99": { "baseline": 300, "current": 400, "changePercent": 33, "status": "degraded" }
    },
    "throughput": { "baseline": 10, "current": 9.5, "changePercent": -5, "status": "unchanged" },
    "errorRate": { "baseline": 1, "current": 2, "changePercent": 100, "status": "degraded" },
    "failures": ["p95 latency increased by 40.0%, exceeds threshold of 20%", "p99 latency increased by 33.3%, exceeds threshold of 20%"]
  }
}
```

### Regression Testing Workflow

```
1. Run baseline test:
   run_preset_test(target="https://api.example.com", preset="baseline", outputJson="./baseline.json")

2. Deploy code changes...

3. Run comparison test:
   run_preset_test(target="https://api.example.com", preset="baseline", outputJson="./current.json")

4. Compare results:
   compare_results(baselinePath="./baseline.json", currentPath="./current.json")
   → Returns pass/fail with detailed metrics
```

---

## Example Test Configurations

### Basic HTTP Test

```yaml
# examples/http.yml
config:
  target: 'https://httpbin.org'
  phases:
    - duration: 10
      arrivalRate: 5
    - duration: 5
      arrivalRate: 0
  defaults:
    headers:
      User-Agent: 'Artillery-MCP-Server/3.0.0'

scenarios:
  - name: "Basic HTTP test"
    flow:
      - get:
          url: "/get"
      - post:
          url: "/post"
          json:
            message: "Hello from Artillery MCP Server"
```

### Inline Configuration

```json
{
  "config": {
    "target": "https://jsonplaceholder.typicode.com",
    "phases": [
      {
        "duration": 30,
        "arrivalRate": 2
      }
    ]
  },
  "scenarios": [
    {
      "name": "API Test",
      "flow": [
        {
          "get": {
            "url": "/posts/1"
          }
        }
      ]
    }
  ]
}
```

## Output Examples

### JSON Results

```json
{
  "status": "ok",
  "tool": "run_test_from_file",
  "data": {
    "exitCode": 0,
    "elapsedMs": 61234,
    "logsTail": "...last 2KB of stdout/stderr...",
    "jsonResultPath": "./results/run-2025-01-21.json",
    "htmlReportPath": "./results/report-2025-01-21.html",
    "summary": {
      "requestsTotal": 12345,
      "rpsAvg": 205.3,
      "latencyMs": {
        "p50": 120,
        "p95": 280,
        "p99": 410
      },
      "errors": {
        "ETIMEDOUT": 12,
        "ECONNRESET": 3
      }
    }
  }
}
```

### Parsed Results Summary

```json
{
  "status": "ok",
  "tool": "parse_results",
  "data": {
    "summary": {
      "requestsTotal": 12345,
      "rpsAvg": 205.3,
      "latencyMs": {
        "p50": 120,
        "p95": 280,
        "p99": 410
      },
      "errors": {
        "ETIMEDOUT": 12,
        "ECONNRESET": 3
      },
      "errorsTotal": 15
    },
    "scenarios": [
      {
        "name": "Basic HTTP test",
        "count": 12345
      }
    ],
    "metadata": {
      "startedAt": "2025-01-21T10:00:00.000Z",
      "finishedAt": "2025-01-21T10:01:00.000Z",
      "durationMs": 60000,
      "totalRequests": 12345
    }
  }
}
```

## Safety Features

The server is designed to be driven by an LLM, so it limits what a tool call can reach:

- **Working directory boundary**: every path (config files, `cwd`, `outputJson`, `reportHtml`, results files) is resolved against `ARTILLERY_WORKDIR` and rejected if it ends up outside it. The check uses `path.relative` and follows symlinks, so `cwd: "/"`, `../`, look-alike sibling directories and symlinks that point elsewhere all fail.
- **Environment allowlist**: Artillery runs with `PATH`, `HOME`, temp, locale, proxy and TLS variables plus any `ARTILLERY_*` values from the server environment. Caller-supplied `env` entries are added on top, but `PATH`, `NODE_OPTIONS`, `NODE_PATH`, `LD_PRELOAD`, `DYLD_*` and similar cannot be overridden.
- **Timeouts**: a run that exceeds `ARTILLERY_TIMEOUT_MS` has its whole process group killed, including Artillery worker processes, and the result reports `timedOut: true` with a non-zero exit code.
- **Output limits**: captured stdout and stderr are capped at `ARTILLERY_MAX_OUTPUT_MB`.
- **Only Artillery runs**: the server spawns the detected Artillery binary directly, never a shell.
- **TLS verification stays on**: `quick_test` only skips certificate checks when `insecure: true` is passed.

What the server does not do: it does not inspect the Artillery config itself. A config can still target any host, use Artillery processors or plugins, and read files that Artillery can read. Point `ARTILLERY_WORKDIR` at a dedicated directory and treat the tools as having the same reach as the user account running the server.

## Error Handling

Failed calls are returned with the MCP `isError` flag set, and the text content carries a structured error:

```json
{
  "status": "error",
  "tool": "run_test_from_file",
  "error": {
    "code": "EXECUTION_ERROR",
    "message": "Test execution failed",
    "details": {
      "tool": "run_test_from_file",
      "arguments": { "path": "test.yml" }
    }
  }
}
```

Common error codes:
- `EXECUTION_ERROR`: Test execution failed
- `VALIDATION_ERROR`: Input validation failed
- `CAPABILITIES_ERROR`: Server capability check failed
- `PARSE_ERROR`: Results parsing failed
- `INTERNAL_ERROR`: Server internal error

## Development

### Project Structure

```
src/
├── server.ts              # Main server entrypoint and tool registration
├── types.ts               # TypeScript type definitions
├── version.ts             # Server version read from package.json
├── lib/
│   ├── artillery.ts       # Artillery CLI wrapper
│   ├── paths.ts           # Working directory boundary checks
│   ├── results.ts         # Results summarisation shared by the tools
│   ├── config-storage.ts  # Saved configs storage layer
│   └── wizard.ts          # Interactive wizard state machine
└── tools/                 # MCP tool implementations (16 tools)
    ├── index.ts
    ├── run-test-from-file.ts
    ├── run-test-inline.ts
    ├── run-saved-config.ts
    ├── run-preset-test.ts     # Quick preset tests
    ├── quick-test.ts
    ├── list-capabilities.ts
    ├── parse-results.ts
    ├── list-results.ts
    ├── compare-results.ts     # Result comparison
    ├── save-config.ts
    ├── list-configs.ts
    ├── get-config.ts
    ├── delete-config.ts
    ├── wizard-start.ts
    ├── wizard-step.ts
    └── wizard-finalize.ts
```

### Building

```bash
# Development build with watch
npm run dev

# Production build
npm run build

# Lint and type check
npm run lint
npm run typecheck
```

The test suite includes a smoke test that runs against a real Artillery binary. It is skipped automatically when `artillery` is not on `PATH`.

### Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npx vitest run src/lib/__tests__/artillery.test.ts
```

## Troubleshooting

### Artillery Binary Not Found

```bash
# Check if Artillery is installed
which artillery

# Set custom path
export ARTILLERY_BIN="/usr/local/bin/artillery"

# Verify binary is executable
ls -la $ARTILLERY_BIN
```

### Permission Denied

```bash
# Check working directory permissions
ls -la $ARTILLERY_WORKDIR

# Ensure Artillery binary is executable
chmod +x $ARTILLERY_BIN
```

### Test Timeouts

```bash
# Increase timeout for long-running tests
export ARTILLERY_TIMEOUT_MS=3600000  # 1 hour

# Check for infinite loops in test config
```

### Output Size Issues

```bash
# Increase output size limit
export ARTILLERY_MAX_OUTPUT_MB=100

# Check for excessive logging in test config
```

## Upgrading

### From 2.x to 3.0

Version 3.0 tightens the sandbox and fixes result parsing. Points to check when upgrading:

- Every path must be inside `ARTILLERY_WORKDIR`. Relative paths are resolved against it, so `results/run.json` works and `/tmp/run.json` does not.
- `summary.errors` is now a map of Artillery `errors.*` counters and `summary.errorsTotal` is their sum. Summaries also carry `responsesTotal`, `httpCodes` and `vusers`.
- `parse_results` returns `scenarios` as `{ name, count }` and `metadata` as `{ startedAt, finishedAt, durationMs, totalRequests }`.
- `quick_test` sends exactly `count` requests, honours `method`, `headers` and `body`, and verifies TLS unless `insecure: true` is set. Result files are deleted after the run unless `keepResults` or `outputJson` is set.
- `compare_results` gates on p50, p95 and p99 by default. Pass `thresholds.latencyPercentiles: ["p95"]` for the old behaviour.
- Node.js 22.18 or later is required.

The full list is in the [changelog](CHANGELOG.md).

### Test Type Presets

| Preset | Duration | Load Profile | Use Case |
|--------|----------|--------------|----------|
| `smoke` | 30s | 1 req/s | Quick functionality check |
| `baseline` | 2min | 5→10→5 req/s | Establish performance baseline |
| `soak` | 10min | 5 req/s steady | Find memory leaks, resource exhaustion |
| `spike` | 100s | 5→50→5 req/s | Test sudden traffic surges |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/jch1887/artillery-mcp-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/jch1887/artillery-mcp-server/discussions)
- **Documentation**: [Artillery Docs](https://www.artillery.io/docs)

## Acknowledgments

- [Artillery](https://www.artillery.io/) - Load testing framework
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - Official MCP SDK
