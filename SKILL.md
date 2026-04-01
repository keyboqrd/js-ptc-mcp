---
name: js-ptc-mcp
description: How to use the js-ptc-mcp server for Programmatic Tool Chaining (PTC) - orchestrating multiple MCP tools in parallel, executing complex multi-step logic, and running JavaScript calculations in a QuickJS sandbox. Use this skill whenever the user needs to coordinate multiple tool calls, execute parallel operations, handle conditional logic between tool calls, or run JavaScript code for data transformation. This includes tasks like "fetch data from multiple sources and combine them", "run this calculation", "execute these tools in parallel", or any workflow requiring tool orchestration.
---

# js-ptc-mcp Skill

This skill helps you use the **js-ptc-mcp** server effectively for Programmatic Tool Chaining (PTC) - a pattern that compresses multi-step tool dependencies into a single programmatic execution script.

## When to Use js-ptc-mcp

Use js-ptc-mcp when you need to:

1. **Orchestrate multiple tool calls** - Chain together several MCP tools in a logical sequence
2. **Execute tools in parallel** - Run independent tool calls concurrently using `Promise.all`
3. **Handle conditional logic** - Make decisions based on tool results before calling the next tool
4. **Process/aggregate data** - Transform, filter, or combine results from multiple sources
5. **Run JavaScript calculations** - Execute pure JS logic in an isolated sandbox
6. **Reduce latency** - Eliminate round-trip overhead by executing orchestration locally

### Triggers

Make sure to use this skill whenever:
- The user asks to "run multiple tools at once" or "parallel execution"
- You need to coordinate complex workflows across different MCP servers
- The task involves loops, conditionals, or data aggregation
- You want to minimize LLM round-trips for efficiency
- The user mentions "orchestration", "pipeline", or "workflow"
- You're working with the `js-ptc-mcp` MCP server (installed via `claude mcp add js-ptc-mcp`)

## Installation

The server is typically installed as:
```bash
claude mcp add js-ptc-mcp --scope user npx js-ptc-mcp@latest gateway
```

Location: `C:\Users\meh\AppData\Roaming\npm\node_modules\js-ptc-mcp`

## Two Operating Modes

### Mode A: Gateway Mode (Default for Local Development)

Best for: Cursor, Claude Desktop, Claude Code, Gemini CLI

Gateway mode operates as a **transparent proxy** using STDIO. It dynamically spawns child MCP servers based on a configuration file and executes the JS micro-loop internally.

**Setup:**

1. Create a `sub-mcp-servers.json` in your project root:
```json
{
  "chrome": {
    "command": "npx",
    "args": ["-y", "chrome-devtools-mcp@latest"]
  },
  "fs": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
  }
}
```

2. The Gateway automatically exposes all child tools to the LLM (e.g., `chrome.navigate_page`, `fs.read_file`)

**Best Practice:** Do NOT register tools like `chrome-devtools-mcp` directly in your client config if they're managed by the Gateway. The Gateway handles tool exposure automatically.

### Mode B: Remote Mode (For Custom Cloud Agents)

Best for: SaaS platforms, distributed web architectures

Remote mode operates as an **orchestrator using SSE** (Server-Sent Events). It uses Inversion of Control (IoC) - the sandbox suspends execution and requests your backend to perform operations.

**Setup:**
```bash
# Copy .env.example to .env and configure PTC_API_KEY
npx -y js-ptc-mcp remote --port 3000
```

**The IoC Loop:**
1. Call `run_js_code` with your orchestration script
2. If status is `need_client_tool`:
   - Execute the requested tools in your secure backend
   - Call `resume_js_code` with the results
3. Repeat until status is `success`

See `client-sample/backend-service.js` in the js-ptc-mcp repository for a full implementation.

## The Sandbox Environment

The QuickJS WASM sandbox is **strictly isolated** - it focuses on state-machine orchestration, data manipulation, and general-purpose logic.

### Available in Sandbox

- `call_client_tool(name, args)` - Invoke MCP tools (returns a Promise)
- `print(data)` - Log output to host console
- `async/await` - Full async support
- `Promise.all` - Parallel execution
- ES2022 primitives: `Math`, `Date`, `Array`, `String`, etc.

### NOT Available in Sandbox

- **NO** `fetch` - Use `call_client_tool` for HTTP requests via appropriate MCP tools
- **NO** `setTimeout` / `setInterval` - No timers
- **NO** Node.js APIs (`fs`, `path`, etc.)
- **NO** Browser APIs
- **NO** direct file system access

All external interactions must go through `call_client_tool`.

## Tool Format

When calling `call_client_tool`, use the format: `server.tool_name`

For example, if your `sub-mcp-servers.json` defines:
```json
{
  "chrome": { ... },
  "fs": { ... }
}
```

You call tools as:
```javascript
await call_client_tool("fs.read_file", { path: "config.json" });
await call_client_tool("chrome.navigate_page", { url: "https://example.com" });
```

## Example Patterns

### Pattern 1: Parallel Data Fetching

```javascript
// Execute multiple independent tools concurrently
const [user, config, logs] = await Promise.all([
  call_client_tool("db.get_user", { id: 123 }),
  call_client_tool("fs.read_file", { path: "config.json" }),
  call_client_tool("fs.read_file", { path: "app.log" })
]);

return {
  username: user.name,
  theme: config.theme,
  logSize: logs.length
};
```

### Pattern 2: Conditional Logic

```javascript
const user = await call_client_tool("db.get_user", { id: 123 });

if (user.isAdmin) {
  print("Admin detected, applying special config...");
  await call_client_tool("db.update", { 
    id: 123, 
    status: "active",
    permissions: ["read", "write", "delete"]
  });
} else {
  print("Regular user, applying standard config...");
  await call_client_tool("db.update", { id: 123, status: "active" });
}

return { userId: user.id, updated: true };
```

### Pattern 3: Data Aggregation with Loops

```javascript
const fileList = await call_client_tool("fs.list_directory", { path: "./data" });

const results = [];
for (const file of fileList) {
  if (file.endsWith(".json")) {
    const content = await call_client_tool("fs.read_file", { path: file });
    const data = JSON.parse(content);
    results.push({
      filename: file,
      recordCount: data.records?.length || 0,
      timestamp: data.timestamp
    });
  }
}

// Sort by timestamp and return summary
results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
return {
  totalFiles: results.length,
  newestFile: results[0]?.filename,
  totalRecords: results.reduce((sum, r) => sum + r.recordCount, 0)
};
```

### Pattern 4: Error Handling

```javascript
try {
  const data = await call_client_tool("api.fetch", { url: "https://api.example.com/data" });
  return { status: "success", data };
} catch (error) {
  print(`API call failed: ${error.message}`);
  // Fallback to cached data
  const cached = await call_client_tool("fs.read_file", { path: ".cache/data.json" });
  return { status: "cached", data: JSON.parse(cached), warning: "Using stale data" };
}
```

### Pattern 5: Pure JavaScript Calculation

```javascript
// No tool calls needed - just computation
const fibonacci = (n) => {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
};

const data = [1, 2, 3, 4, 5];
const processed = data
  .map(x => x * 2)
  .filter(x => x > 5)
  .reduce((sum, x) => sum + x, 0);

return {
  fib10: fibonacci(10),
  processed,
  timestamp: new Date().toISOString()
};
```

## Common Use Cases

| Task | Pattern |
|------|---------|
| "Fetch from 3 APIs and merge results" | `Promise.all` + aggregation |
| "Only update if condition is met" | Conditional `if` logic |
| "Process all files in directory" | Loop + `call_client_tool` |
| "Transform this data structure" | Pure JS computation |
| "Retry on failure" | `try/catch` with retry loop |
| "Compare two sources" | Parallel fetch + comparison logic |

## Best Practices

1. **Return distilled results** - Only return the final, aggregated data to minimize context window usage
2. **Use `print()` for debugging** - Helps trace execution in the host console
3. **Parallelize independent calls** - Use `Promise.all` when tool calls don't depend on each other
4. **Handle errors gracefully** - Wrap tool calls in `try/catch` and provide fallbacks
5. **Keep scripts focused** - Break complex workflows into clear phases
6. **Validate inputs early** - Check arguments before starting tool calls

## Debugging Tips

- Use `print()` to log intermediate values
- Check the host console for `[Sandbox Script]` log messages
- If execution hangs, check for unresolved Promises
- Syntax errors are caught immediately; runtime errors appear after `pump()`

## Architecture Notes

- **Gateway Mode** is ideal for local development - the micro-loop runs internally
- **Remote Mode** is for cloud agents - your backend handles the suspend/resume loop
- Both modes share the same QuickJS deterministic state-machine
- The sandbox is memory-safe with a 1MB stack limit

## Files and Resources

- **Main entry**: `dist/cli.js` - CLI with `gateway` and `remote` commands
- **Core engine**: `dist/core/sandbox.js` - QuickJS sandbox implementation
- **Gateway mode**: `dist/modes/gateway/` - STDIO server + registry
- **Remote mode**: `dist/modes/remote/` - SSE orchestrator server
- **Config file**: `sub-mcp-servers.json` - Defines child MCP servers (Gateway mode)

## Troubleshooting

**Tools not appearing?** Check that `sub-mcp-servers.json` exists in your project root and is valid JSON.

**Tool call fails?** Verify the tool name format: `server.tool_name` (check your registry keys).

**Sandbox hangs?** Likely an unresolved Promise - ensure all async operations complete or have timeouts.

**Memory errors?** The sandbox has a 1MB stack limit - avoid deeply recursive operations.
