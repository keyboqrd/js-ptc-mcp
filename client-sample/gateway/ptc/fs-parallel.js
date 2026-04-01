// gateway-ptc-call.js (Gateway Mode - Stdio)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, "../../../dist/cli.js");

async function main() {
  console.log("=========================================================");
  console.log("[LLM Client] DEMO: PTC Orchestration in Gateway Mode");

  const transport = new StdioClientTransport({ 
    command: "node", 
    args: [SERVER_PATH, "gateway"] 
  });
  const mcpClient = new Client({ name: "ptc-gateway-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await mcpClient.connect(transport);
    console.log("[LLM Client] ✅ Connected to Gateway!");

    const script = `
      print("🚀 Starting concurrent directory scan...");
      const [root, nodeModules] = await Promise.all([
        call_client_tool("fs.list_directory", { path: "./" }),
        call_client_tool("fs.list_directory", { path: "./node_modules" })
      ]);
      return { rootCount: root.length, nodeModulesCount: nodeModules.length };
    `;

    console.log("\n[Action] Executing PTC Script (Orchestrated in Sandbox)...");
    const response = await mcpClient.callTool({
      name: "run_js_code",
      arguments: { code: script }
    });

    console.log("Response from PTC Engine:");
    console.log(response.content[0].text);

  } catch (err) {
    console.error("\n[Error]", err.message);
  } finally {
    await transport.close();
  }
}

main();
