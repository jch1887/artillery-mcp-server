# Artillery MCP Server

A production-ready Model Context Protocol (MCP) server that exposes safe, ergonomic tools for running and inspecting Artillery load tests from MCP-compatible clients like Claude Desktop and Cursor.

## Features

- **Safe Execution**: Only executes Artillery CLI with validated parameters
- **Multiple Test Modes**: Run tests from files, inline configs, or quick HTTP tests
- **Comprehensive Output**: JSON results, HTML reports, and structured summaries
- **Dry-Run Validation**: Validate configurations without execution
- **Progress Streaming**: Real-time progress updates (if client supports it)
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
| `ARTILLERY_ALLOW_QUICK` | false | Enable quick HTTP tests |
| `LOG_LEVEL` | info | Logging level (debug, info, warn, error) |

### Example Configuration

```bash
export ARTILLERY_WORKDIR="/path/to/test/configs"
export ARTILLERY_TIMEOUT_MS=900000  # 15 minutes
export ARTILLERY_MAX_OUTPUT_MB=50   # 50MB output limit
export ARTILLERY_ALLOW_QUICK=true   # Enable quick tests
export LOG_LEVEL=debug
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

**Parameters:**
- `configText` (required): Artillery config as YAML/JSON string
- `outputJson` (optional): Path for JSON results output
- `reportHtml` (optional): Path for HTML report output
- `env` (optional): Environment variables
- `cwd` (optional): Working directory
- `validateOnly` (optional): Dry-run validation only

**Example:**
```json
{
  "configText": "config:\n  target: 'https://example.com'\n  phases:\n    - duration: 10\n      arrivalRate: 5",
  "outputJson": "/path/to/results.json"
}
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
    requests:
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
      "requests": [
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
├── server.ts          # Main server entrypoint
├── types.ts           # TypeScript type definitions
├── lib/
│   └── artillery.ts   # Artillery CLI wrapper
└── tools/             # MCP tool implementations
    ├── index.ts
    ├── run-test-from-file.ts
    ├── run-test-inline.ts
    ├── quick-test.ts
    ├── list-capabilities.ts
    └── parse-results.ts
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
