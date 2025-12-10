# Artillery MCP Server

A production-ready Model Context Protocol (MCP) server that exposes safe, ergonomic tools for running and inspecting Artillery load tests from MCP-compatible clients like Claude Desktop and Cursor.

## Features

- **Safe Execution**: Only executes Artillery CLI with validated parameters
- **Multiple Test Modes**: Run tests from files, inline configs, or quick HTTP tests
- **Saved Configurations**: Save, manage, and reuse Artillery test configs by name
- **Interactive Wizard**: Step-by-step guided test building with preset test types
- **Preset Tests**: Run smoke/baseline/soak/spike tests with minimal configuration
- **Regression Detection**: Compare test results against baseline with configurable thresholds
- **Comprehensive Output**: JSON results, HTML reports, and structured summaries
- **Dry-Run Validation**: Validate configurations without execution
- **Security**: Path sanitization, timeout controls, and output size limits

## Prerequisites

- Node.js 18+ 
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

**Parameters:**
- `path` (required): Path to Artillery config file
- `outputJson` (optional): Path for JSON results output
- `reportHtml` (optional): Path for HTML report output
- `env` (optional): Environment variables
- `cwd` (optional): Working directory
- `validateOnly` (optional): Dry-run validation only

**Example:**
```json
{
  "path": "/path/to/test.yml",
  "outputJson": "/path/to/results.json",
  "reportHtml": "/path/to/report.html",
  "validateOnly": false
}
```

### 2. `run_test_inline`

Run an Artillery test from inline configuration.

**Note:** Artillery 2.0+ requires using `flow` instead of `requests` in scenarios. See the example below for the correct format.

**Parameters:**
- `configText` (required): Artillery config as YAML/JSON string
- `outputJson` (optional): Path for JSON results output
- `reportHtml` (optional): Path for HTML report output
- `env` (optional): Environment variables
- `cwd` (optional): Working directory
- `validateOnly` (optional): Dry-run validation only

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
        User-Agent: 'Artillery-MCP-Server/1.0.0'
  
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

Run a quick HTTP test without full configuration.

**Parameters:**
- `target` (required): URL to test
- `rate` (optional): Requests per second
- `duration` (optional): Test duration (e.g., "1m")
- `count` (optional): Total request count
- `method` (optional): HTTP method (default: GET)
- `headers` (optional): HTTP headers
- `body` (optional): Request body

**Example:**
```json
{
  "target": "https://api.example.com/health",
  "rate": 10,
  "duration": "30s",
  "method": "GET"
}
```

### 4. `list_capabilities`

Report server capabilities and configuration.

**Parameters:** None

**Returns:**
```json
{
  "artilleryVersion": "2.0.0",
  "serverVersion": "1.0.0",
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

Parse and summarize Artillery JSON results.

**Parameters:**
- `jsonPath` (required): Path to Artillery JSON results file

**Example:**
```json
{
  "jsonPath": "/path/to/results.json"
}
```

---

## Saved Configurations

The server supports saving and managing reusable Artillery configurations. Saved configs are stored in `$ARTILLERY_WORKDIR/saved-configs/` and can be referenced by name.

### 6. `save_config`

Save a new Artillery configuration or update an existing one.

**Parameters:**
- `name` (required): Unique name for the config (alphanumeric, hyphens, underscores)
- `content` (required): Artillery configuration as YAML or JSON string
- `description` (optional): Description of what this config tests
- `tags` (optional): Array of tags for organization (e.g., `["smoke", "api"]`)

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

### 7. `list_configs`

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

### 8. `get_config`

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

### 9. `delete_config`

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

### 10. `run_saved_config`

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
      "rpsAvg": 4.6,
      "latencyMs": { "p50": 85, "p95": 120, "p99": 180 },
      "errors": {}
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

### 11. `wizard_start`

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

### 12. `wizard_step`

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

### 13. `wizard_finalize`

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

### 14. `run_preset_test`

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

### 15. `compare_results`

Compare two Artillery test results to detect performance regressions.

**Parameters:**
- `baselinePath` (required): Path to baseline (reference) JSON results
- `currentPath` (required): Path to current (new) JSON results
- `thresholds` (optional): Custom thresholds for pass/fail
  - `maxLatencyIncrease`: Max latency increase (default: 0.2 = 20%)
  - `maxErrorRateIncrease`: Max error rate increase (default: 0.01 = 1%)
  - `minThroughputRatio`: Min throughput as ratio of baseline (default: 0.9 = 90%)

**Example:**
```json
{
  "baselinePath": "/results/baseline.json",
  "currentPath": "/results/current.json",
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
    "failures": ["P95 latency increased by 40.0%, exceeds threshold of 20%"]
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
      User-Agent: 'Artillery-MCP-Server/1.0.0'

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
      }
    },
    "scenarios": [
      {
        "name": "Basic HTTP test",
        "count": 10,
        "successRate": 100,
        "avgLatency": 180
      }
    ],
    "metadata": {
      "timestamp": "2025-01-21T10:00:00.000Z",
      "duration": "1m",
      "totalRequests": 12345
    }
  }
}
```

## Safety Features

- **Path Sanitization**: Prevents directory traversal attacks
- **Timeout Controls**: Automatic process termination for hung tests
- **Output Limits**: Configurable size caps for stdout/stderr capture
- **Environment Isolation**: Controlled environment variable injection
- **Binary Validation**: Only executes known Artillery binary
- **Working Directory Restriction**: Tests cannot escape configured workdir

## Error Handling

All tools return structured error responses:

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
├── server.ts              # Main server entrypoint
├── types.ts               # TypeScript type definitions
├── lib/
│   ├── artillery.ts       # Artillery CLI wrapper
│   ├── config-storage.ts  # Saved configs storage layer
│   └── wizard.ts          # Interactive wizard state machine
└── tools/                 # MCP tool implementations (15 tools)
    ├── index.ts
    ├── run-test-from-file.ts
    ├── run-test-inline.ts
    ├── run-saved-config.ts
    ├── run-preset-test.ts     # Quick preset tests
    ├── quick-test.ts
    ├── list-capabilities.ts
    ├── parse-results.ts
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

# Type checking
npx tsc --noEmit
```

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

## Version 2.0 Features

This version introduces significant new capabilities while maintaining backward compatibility:

### New in 2.0

| Feature | Tools | Description |
|---------|-------|-------------|
| **Saved Configs** | `save_config`, `list_configs`, `get_config`, `delete_config`, `run_saved_config` | Save and reuse Artillery configurations by name |
| **Interactive Wizard** | `wizard_start`, `wizard_step`, `wizard_finalize` | Step-by-step guided test building |
| **Preset Tests** | `run_preset_test` | Run smoke/baseline/soak/spike with minimal config |
| **Result Comparison** | `compare_results` | Detect regressions against baseline |

### Migrating from 1.x

**No breaking changes** - all existing tools work exactly as before:
- `run_test_from_file` ✅
- `run_test_inline` ✅
- `quick_test` ✅
- `list_capabilities` ✅
- `parse_results` ✅

**New capabilities are additive:**
- Use `run_preset_test` for quick tests without config files
- Use the wizard tools for guided configuration building
- Use `compare_results` for CI/CD regression detection
- Use saved configs for team collaboration and reproducibility

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
