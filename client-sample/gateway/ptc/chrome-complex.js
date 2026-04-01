// gateway-chrome-ptc.js (Gateway Mode - Stdio)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, "../../../dist/cli.js");

async function main() {
  console.log("=========================================================");
  console.log("[LLM Client] DEMO: Chrome PTC Orchestration (In-Sandbox)");

  const transport = new StdioClientTransport({ 
    command: "node", 
    args: [SERVER_PATH, "gateway"] 
  });
  const mcpClient = new Client({ name: "chrome-ptc-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await mcpClient.connect(transport);
    console.log("[LLM Client] ✅ Connected to Gateway!");

    const script = `
      print("🚀 PTC Sandbox: Navigating to Google...");
      await call_client_tool("chrome.navigate_page", { url: "https://www.google.com" });

      print("PTC Sandbox: Running page evaluation on Google...");
      const title = await call_client_tool("chrome.evaluate_script", { 
        function: "() => document.title" 
      });
      print(\`✅ Sandbox captured title: \${title.result || title}\`);
      
      print("PTC Sandbox: Navigating to GitHub...");
      await call_client_tool("chrome.navigate_page", { url: "https://github.com" });
      
      const githubTitle = await call_client_tool("chrome.evaluate_script", { 
        function: "() => document.title" 
      });
      return { googleTitle: title.result || title, githubTitle: githubTitle.result || githubTitle };
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
