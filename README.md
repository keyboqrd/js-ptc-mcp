# JavaScript Programmatic-Tool-Calling MCP Server

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

See [SKILL.md](./SKILL.md) for a concise guide on using `run_js_code` for tool orchestration, parallel execution, and data aggregation.

---

## Usage

PTC MCP supports two distinct architectures depending on your deployment topology.

### Mode A: Gateway Mode (For Cursor, Claude Desktop, Gemini CLI, etc.)
Operates as a transparent proxy using STDIO. It dynamically spawns local child MCP servers based on a configuration and executes the JS micro-loop internally.

1. **Configure Sub-Servers**: Create a `sub-mcp-servers.json` in your project root to define underlying tools:
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

2. **Add to your Client**:
   - **Gemini CLI:**
     ```bash
     gemini mcp add ptc npx -y js-ptc-mcp gateway
     ```
   - **Claude Code:**
     ```bash
     claude mcp add ptc npx -y js-ptc-mcp gateway
     ```
   - **Manual (Cursor / Claude Desktop):**
     Add the following to your `mcpServers` configuration:
     ```json
     {
       "mcpServers": {
         "js-ptc-mcp": {
           "command": "npx",
           "args": ["-y", "js-ptc-mcp", "gateway"]
         }
       }
     }
     ```

> **💡 Best Practice: Direct Tool Exposure**
> To prevent port collisions and resource exhaustion, do **NOT** register tools like `chrome-devtools-mcp` directly in your client config if they are managed by the PTC Gateway. The Gateway automatically exposes all child tools (e.g., `chrome.navigate_page`) to the LLM.

### Mode B: Remote Mode (For Custom Cloud Agents)
Operates as an orchestrator using SSE (Server-Sent Events). It executes no tools itself, instead relying on **Inversion of Control (IoC)** to suspend execution and request your secure backend to perform the operations.

1. **Set Up**: Copy `.env.example` to `.env` and configure your `PTC_API_KEY`.
2. **Run Server**:
    ```bash
    npx -y js-ptc-mcp remote --port 3000
    ```

#### How it Works: The IoC Loop
In Remote Mode, your backend must implement a simple loop to handle tool requests from the sandbox. When the sandbox needs a tool, it returns a `need_client_tool` status.

**Workflow:**
1. Call `run_js_code`.
2. If status is `need_client_tool`:
   - Execute the requested tools in your secure environment.
   - Call `resume_js_code` with the results.
3. Repeat until status is `success`.

> **Example**: See `client-sample/remote/backend-service.js` for a full implementation of the execution loop using the MCP SDK.

---

## The Sandbox Environment

The QuickJS WASM environment is strictly sandboxed, focusing on state-machine orchestration, data manipulation, and **general-purpose logic**. It can be used for both complex tool chaining and simple pure JavaScript calculations or data transformations.

- **Available**: `call_client_tool("alias.tool_name", args)`, `print(data)`, `async/await`, `Promise.all`, and standard ES2022 primitives (Math, Date, Array, String, etc.).
- **Constraints**: **NO** `fetch`, **NO** timers (`setTimeout`), and **NO** Node.js/Browser APIs. All external interactions must be routed through `call_client_tool`.

### Example LLM Script

**Scenario A: Pure JavaScript Calculation**
```javascript
const fib = (n) => n <= 1 ? n : fib(n - 1) + fib(n - 2);
return { result: fib(10) };
```

**Scenario B: Tool Orchestration**
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
