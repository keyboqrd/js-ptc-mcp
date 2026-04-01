/**
 * Generates the definition for the 'run_js_code' tool.
 * The description is optimized for LLM readability with a clear, universal example.
 */
export const getRunJsCodeTool = (availableServices?: string[]) => {
  const serviceNote = availableServices
    ? `\n- **Service Format**: Use 'server.tool' (e.g., 'fs.read_file').\n- **Available Servers**: [${availableServices.join(", ")}]`
    : "- **Format**: Use the tool name as defined in your environment.";

  return {
    name: "run_js_code",
    description: `Programmatic Tool Chaining (PTC) Environment.
The engine remains focused on high-performance tool orchestration, data manipulation, and general-purpose logic. 
Use this tool for multi-step logic, parallel execution, complex data processing, or pure JavaScript calculations.

**Criteria for Use**:
1. **Dependency**: Step B depends on Step A with conditional logic.
2. **Concurrency**: Executing multiple independent tasks via 'Promise.all'.
3. **Aggregation**: Filtering or summarizing large datasets from multiple tools.
4. **Logic**: Performing complex calculations or data transformations (e.g., formatting, sorting).
5. **Efficiency**: Minimizing LLM round-trips to reduce latency and token cost.

**Environment Specs**:
- **Tool Invocation**: Use 'await call_client_tool(name, { args })'.
${serviceNote}
- **Constraints**: Pure QuickJS environment. **NO** 'fetch', **NO** 'setTimeout'/'setInterval', **NO** Node.js 'fs'/'path', **NO** Browser APIs.
- **Output**: Use 'print(data)' for debugging; results appear in the host console.
- **Return**: The script's final 'return' value is the tool's result.

**Example**:
\`\`\`javascript
// 1. Parallel data fetching
const [dataA, dataB] = await Promise.all([
  call_client_tool("fs.read_file", { path: "config.json" }),
  call_client_tool("db.query", { sql: "SELECT * FROM users LIMIT 10" })
]);

// 2. Conditional logic & processing
if (dataA.mode === "debug") {
  print("Debug mode detected, fetching extra logs...");
  const logs = await call_client_tool("fs.read_file", { path: "debug.log" });
  return { status: "debug", count: dataB.length, logs: logs.substring(0, 100) };
}

// 3. Optimized return
return { status: "success", userCount: dataB.length };
\`\`\`
`,
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "The JavaScript orchestration code to execute." }
      },
      required: ["code"],
    },
  };
};

/**
 * Definition for the internal 'resume_js_code' tool used in Remote/SSE mode.
 */
export const RESUME_JS_CODE_TOOL = {
  name: "resume_js_code",
  description: "[Internal Protocol Tool] Resumes a suspended JS session. Automatically called by clients after resolving tool requests.",
  inputSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "Active session ID from 'run_js_code'.",
      },
      tool_results: {
        type: "object",
        description: "Dictionary of tool results (Map of callId to result).",
      },
    },
    required: ["session_id", "tool_results"],
  },
};
