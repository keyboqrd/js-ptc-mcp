// remote-ptc-call.js (Remote Mode - SSE)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import "dotenv/config";

const localTools = {
  get_data: async (args) => {
    console.log(`  [Local Backend] Fetching for ID: ${args.id}`);
    return { id: args.id, value: `Data for ${args.id}` };
  }
};

async function runPtcLoop(mcpClient, jsCode) {
  let response = await mcpClient.callTool({
    name: "run_js_code",
    arguments: { code: jsCode }
  });

  while (true) {
    const data = JSON.parse(response.content[0].text);
    if (data.status === "success") return data.result;
    if (data.status === "error") throw new Error(data.error);

    if (data.status === "need_client_tool") {
      const results = {};
      await Promise.all(data.toolCalls.map(async (call) => {
        const impl = localTools[call.toolName];
        results[call.callId] = impl ? await impl(call.args) : { __is_error: true, message: "Not found" };
      }));

      response = await mcpClient.callTool({
        name: "resume_js_code",
        arguments: { session_id: data.sessionId, tool_results: results }
      });
    }
  }
}

async function main() {
  const SERVER_URL = "http://localhost:3000/sse";
  const API_KEY = process.env.PTC_API_KEY || "your-secret-api-key-here";

  console.log("=========================================================");
  console.log(`[LLM Client] DEMO: Remote Orchestration (SSE)`);

  const transport = new SSEClientTransport(new URL(SERVER_URL), {
    eventSourceInit: { headers: { "x-api-key": API_KEY } },
    requestInit: { headers: { "x-api-key": API_KEY } }
  });

  const mcpClient = new Client({ name: "remote-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await mcpClient.connect(transport);
    console.log("[LLM Client] ✅ Connected to Remote Server!");

    const script = `
      const [res1, res2] = await Promise.all([
        call_client_tool("get_data", { id: 1 }),
        call_client_tool("get_data", { id: 2 })
      ]);
      return { combined: [res1, res2] };
    `;

    console.log("\n[Action] Running PTC Loop...");
    const result = await runPtcLoop(mcpClient, script);
    console.log("Final Result:", JSON.stringify(result, null, 2));

  } catch (err) {
    console.error("\n[Error]", err.message);
  } finally {
    await transport.close();
  }
}

main();
