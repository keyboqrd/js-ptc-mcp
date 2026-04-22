---
name: js-ptc-mcp
description: Orchestrate multiple MCP tool calls in a single script using the `run_js_code` tool. Use this skill when the user needs to call multiple tools with dependencies between them, run tools in parallel, apply conditional logic between tool calls, aggregate data from multiple tool results, or run pure JavaScript calculations. Triggers include "run these tools together", "parallel tool calls", "tool orchestration", "combine results from multiple tools", "if this tool returns X then call Y", or when you identify a workflow that requires sequential or parallel tool coordination.
---

# js-ptc-mcp: Programmatic Tool Calling

Use `run_js_code` to execute a JavaScript script that orchestrates multiple MCP tool calls in one shot — with parallel execution, conditionals, loops, and data aggregation.

## Setup

The `run_js_code` tool is provided by the js-ptc-mcp MCP server. If it is not yet available in your tool list, install it:

**Claude Code / Claude Desktop / Cursor** — add to your MCP config:
```json
{
  "mcpServers": {
    "js-ptc-mcp": {
      "command": "npx",
      "args": ["-y", "js-ptc-mcp@latest", "gateway"]
    }
  }
}
```

**Gemini CLI / Claude Code CLI:**
```bash
gemini mcp add js-ptc-mcp npx -y js-ptc-mcp@latest gateway
# or
claude mcp add js-ptc-mcp --scope user npx js-ptc-mcp@latest gateway
```

**Sub-servers (optional):** To call other MCP tools from inside scripts, create `sub-mcp-servers.json` in your project root:
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
This lets you call `chrome.navigate_page`, `fs.read_file`, etc. from scripts. Tools managed by the Gateway should NOT be registered separately in the client config — the Gateway exposes them automatically.

## When to Use

Use `run_js_code` instead of calling tools one-by-one when:
- Multiple tool calls have **dependencies** (result of A decides whether to call B)
- Independent calls can run **in parallel** via `Promise.all`
- You need to **loop** over results and call tools for each item
- You need to **aggregate or transform** data from multiple tool results
- Pure **JavaScript computation** (no tool calls) is sufficient

## How to Write Scripts

### API Reference

```javascript
// Call any MCP tool registered in your environment
const result = await call_client_tool("tool_name", { arg1: "value1" });

// Log to host console (useful for debugging)
print("debug message", someData);

// Your script's return value is the tool's output
return { key: "value" };
```

### Tool Name Format

For tools from Gateway-managed sub-servers, use `server_name.tool_name`:

| sub-mcp-servers.json key | Tool call format |
|---|---|
| `"chrome"` | `call_client_tool("chrome.navigate_page", { url: "..." })` |
| `"fs"` | `call_client_tool("fs.read_file", { path: "..." })` |
| `"github"` | `call_client_tool("github.create_issue", { title: "..." })` |

For tools NOT from Gateway sub-servers (e.g., tools directly available in the MCP client), use the tool name as-is: `call_client_tool("tool_name", { ... })`.

### Sandbox Rules

- **Available**: `async/await`, `Promise.all`, `try/catch`, `Math`, `Date`, `JSON`, `Array`, `String`, `Object`, `RegExp`, `Map`, `Set`, `parseInt`, `parseFloat`, `isNaN`
- **NOT available**: `fetch`, `setTimeout`, `setInterval`, `require()`, `import`, Node.js APIs, Browser APIs, file system access
- All external I/O must go through `call_client_tool`
- The script must `return` a value — this becomes the tool result

## Patterns

### Parallel Execution

```javascript
const [users, config, logs] = await Promise.all([
  call_client_tool("db.query", { sql: "SELECT * FROM users" }),
  call_client_tool("fs.read_file", { path: "config.json" }),
  call_client_tool("fs.read_file", { path: "app.log" })
]);

return { userCount: users.length, theme: config.theme };
```

### Conditional Logic

```javascript
const user = await call_client_tool("db.get_user", { id: 123 });

if (user.role === "admin") {
  await call_client_tool("db.update_permissions", { id: 123, level: "full" });
} else {
  await call_client_tool("db.update_permissions", { id: 123, level: "read" });
}

return { userId: user.id, updated: true };
```

### Loop + Aggregate

```javascript
const files = await call_client_tool("fs.list_directory", { path: "./data" });

const summaries = [];
for (const file of files) {
  if (file.name.endsWith(".json")) {
    const content = await call_client_tool("fs.read_file", { path: file.path });
    const data = JSON.parse(content);
    summaries.push({ name: file.name, records: data.length });
  }
}

return summaries;
```

### Error Handling with Fallback

```javascript
try {
  const data = await call_client_tool("api.fetch", { url: "https://api.example.com/data" });
  return { source: "live", data };
} catch (error) {
  print(`Live fetch failed: ${error.message}`);
  const cached = await call_client_tool("fs.read_file", { path: "cache.json" });
  return { source: "cache", data: JSON.parse(cached) };
}
```

### Pure Computation (No Tool Calls)

```javascript
const data = [1, 2, 3, 4, 5];
const result = data.map(x => x * 2).filter(x => x > 5).reduce((sum, x) => sum + x, 0);
return { processed: result, timestamp: new Date().toISOString() };
```

## Best Practices

1. **Only return what the LLM needs** — distill results, don't dump raw data
2. **Parallelize independent calls** — use `Promise.all` when calls don't depend on each other
3. **Handle errors** — wrap tool calls in `try/catch`, provide fallbacks
4. **Use `print()` for debugging** — logs appear in the host console, not in the LLM context
5. **Keep scripts focused** — one clear purpose per script

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Unrecognized MCP server" | Tool name format must be `server_name.tool_name` matching a key in `sub-mcp-servers.json` |
| Script hangs | Likely an unresolved Promise — ensure all `await` calls complete |
| Memory error | Sandbox has 1MB stack limit — avoid deep recursion |
| `fetch is not defined` | Use `call_client_tool` with an HTTP-capable MCP tool instead |
