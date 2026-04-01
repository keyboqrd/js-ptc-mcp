# QuickJS PTC MCP Server

[中文文档 (README-CN.md)](./README-CN.md)

An MCP server implementation for **Programmatic Tool Calling (PTC)** that runs JavaScript. 

The concept of Programmatic Tool Use was pioneered by the Anthropic Claude API, allowing models to write code that orchestrates multiple tools in a single turn. This project provides an **open-source, model-agnostic alternative** for environments where native PTC is unavailable, bringing the same powerful orchestration capabilities to any LLM (OpenAI, Gemini, local models) via the standard MCP protocol.

This server allows Large Language Models (LLMs) to execute complex, multi-step tool orchestrations within a secure, isolated **QuickJS WASM sandbox**, shifting the execution logic from the LLM reasoning loop to deterministic local execution.

## Why PTC?

Traditional LLM tool usage relies on sequential round-trips (*Reason -> Call Tool A -> Wait -> Reason -> Call Tool B*). PTC compresses these multi-step dependencies into a single programmatic execution script, providing:

- **Reduced Latency**: Eliminates network and inference overhead by executing orchestration locally.
- **Concurrency**: Enables true parallel execution of multiple MCP tools using `Promise.all`.
- **Control Flow**: Handles loops, conditionals, and data aggregation directly in the sandbox without relying on LLM context.
- **Context Efficiency**: Returns only the final, distilled data structure back to the LLM context window.

---

## Quick Start

### 1. Installation
Install globally or as a dependency:
```bash
npm install -g js-ptc-mcp
```
Or for local development:
```bash
npm install
npm run build
```

### 2. Choose Your Mode & Run

PTC MCP supports two distinct architectures depending on your deployment topology.

#### Mode A: Gateway Mode (For Standard Clients like Cursor, Claude Desktop)
Operates as a transparent proxy using STDIO. It dynamically spawns local child MCP servers (e.g., Chrome, SQLite) based on a configuration and executes the JS micro-loop internally.

1. Create a `sub-mcp-servers.json` in your project root to define underlying tools:
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
2. Start the Gateway:
    ```bash
    # If installed globally
    js-ptc-mcp gateway

    # For local development
    npm run gateway
    ```
3. **Connect your Client:** Configure your MCP client to execute `node path/to/dist/cli.js gateway`.

> **💡 Best Practice: Direct Tool Exposure**
> To prevent port collisions and resource exhaustion, do **NOT** register tools like `chrome-devtools-mcp` directly in your client config if they are managed by the PTC Gateway. The Gateway automatically exposes all child tools (e.g., `chrome.navigate_page`) to the LLM. The LLM can choose to write a JS script for complex tasks or call the exposed tools directly for single operations.

#### Mode B: Remote Mode (For Custom Cloud Agents)
Operates as an orchestrator using SSE (Server-Sent Events). It executes no tools itself, instead relying on Inversion of Control (IoC) to suspend execution and request your secure backend to perform the operations.

1. Copy `.env.example` to `.env` and configure your `PTC_API_KEY`.
2. Start the SSE Server:
    ```bash
    # Default port is 3000
    npm run remote -- --port 3000
    ```

---

## The Sandbox Environment

The QuickJS WASM environment is strictly sandboxed, focusing entirely on state-machine orchestration and data manipulation.

- **Available**: `call_client_tool("alias.tool_name", args)`, `print(data)`, `async/await`, `Promise.all`, and standard ES2022 primitives (Math, Date, Array, etc.).
- **Constraints**: **NO** `fetch`, **NO** timers (`setTimeout`), and **NO** Node.js/Browser APIs. All external interactions must be routed through `call_client_tool`.

### Example LLM Script

```javascript
print("1. Starting parallel data fetching...");

// Execute multiple underlying MCP tools concurrently
const [user, config] = await Promise.all([
  call_client_tool("db.get_user", { id: 123 }),
  call_client_tool("fs.read_file", { path: "config.json" })
]);

// Handle conditional logic within the sandbox
if (user.isAdmin) {
  print("2. Admin detected, applying special config...");
  await call_client_tool("db.update", { id: 123, status: "active" });
}

// Return the distilled result to the LLM context
return { 
  username: user.name, 
  settings: config.theme 
};
```

---

## Architecture Philosophy

<details>
<summary><b>Understanding the Two Modes</b></summary>

When integrating PTC, developers face a critical divergence: **Where do the underlying tools live, and who executes them?**

1. **Gateway Mode (STDIO)**: Standard clients (e.g., Cursor) are stateless schedulers unable to handle suspend/resume loops. Gateway Mode resolves this by keeping the micro-loop internal. It acts as a black box router to local child processes, making it ideal for local development environments.
2. **Remote Mode (SSE)**: Custom Cloud Agents (e.g., SaaS platforms) utilize proprietary backend APIs. Executing these from a remote sandbox introduces security risks. Remote Mode utilizes SSE to stream "suspend/interrupt" signals to your backend, allowing your secure environment to execute the tools and inject the results back. Ideal for distributed web architectures.

Both modes share **100% of the underlying QuickJS deterministic state-machine**, ensuring memory safety and concurrency regardless of the deployment strategy.
</details>

---

## Development Structure

- `src/core/`: The heart of the engine (Sandbox, Logic, State Machine).
- `src/modes/`: Implementations of the Gateway (STDIO) and Remote (SSE) servers.
- `client-sample/`: Example Node.js clients demonstrating each mode.

## License
MIT
