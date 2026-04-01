// gateway-chrome-direct.js (Gateway Mode - Stdio)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, "../../../dist/cli.js");

async function main() {
  console.log("=========================================================");
  console.log("[LLM Client] DEMO: Chrome Direct Tool Exposure (No Sandbox)");

  const transport = new StdioClientTransport({ 
    command: "node", 
    args: [SERVER_PATH, "gateway"] 
  });
  const mcpClient = new Client({ name: "chrome-direct-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await mcpClient.connect(transport);
    console.log("[LLM Client] ✅ Connected to Gateway!");

    // Direct Call (Simple Navigation)
    console.log("\n[Action] Navigating to Google directly via 'chrome.navigate_page'...");
    await mcpClient.callTool({
      name: "chrome.navigate_page",
      arguments: { url: "https://www.google.com" }
    });
    console.log("✅ Direct Navigation finished!");

  } catch (err) {
    console.error("\n[Error]", err.message);
  } finally {
    await transport.close();
  }
}

main();
