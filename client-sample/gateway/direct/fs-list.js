// gateway-direct-call.js (Gateway Mode - Stdio)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, "../../../dist/cli.js");

async function main() {
  console.log("=========================================================");
  console.log("[LLM Client] DEMO: Direct Tool Exposure (Bypassing Sandbox)");

  const transport = new StdioClientTransport({ 
    command: "node", 
    args: [SERVER_PATH, "gateway"] 
  });
  const mcpClient = new Client({ name: "direct-call-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await mcpClient.connect(transport);
    console.log("[LLM Client] ✅ Connected to Gateway!");

    // List all tools to see the prefixed ones
    const { tools } = await mcpClient.listTools();
    console.log("\nExposed Tools from sub-servers:");
    tools.filter(t => t.name.includes('.')).forEach(t => console.log(` - ${t.name}`));

    // Call a sub-server tool directly
    console.log("\n[Action] Calling 'fs.list_directory' directly...");
    const response = await mcpClient.callTool({
      name: "fs.list_directory",
      arguments: { path: "./" }
    });

    console.log("Response received directly from sub-server:");
    console.log(response.content[0].text);

  } catch (err) {
    console.error("\n[Error]", err.message);
  } finally {
    await transport.close();
  }
}

main();
