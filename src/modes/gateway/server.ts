import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { PTCExecutor } from "./executor.js";
import { McpClientManager } from "./manager.js";
import { TRUSTED_MCP_SERVERS, setTrustedServers, McpServerConfig } from "./registry.js";
import { logger } from "../../core/logger.js";
import { getRunJsCodeTool } from "../../core/definitions.js";

/**
 * Starts the PTC Gateway server using Stdio transport.
 * This mode is designed for local integration (e.g., Cursor, Claude Desktop)
 * where the server manages downstream MCP processes directly.
 */
export async function startGatewayServer(servers: Record<string, McpServerConfig>) {
  setTrustedServers(servers);
  const server = new Server(
    { name: "quickjs-ptc-gateway", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  const clientManager = new McpClientManager();

  // Pre-fetch tools from all registered servers to expose them directly
  const exposedTools = await clientManager.getExposedTools();

  // Register MCP Tool handlers
  setupGatewayHandlers(server, clientManager, exposedTools);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("PTC Gateway running on stdio");

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    logger.info("Shutting down Gateway and closing all downstream connections...");
    await clientManager.closeAll();
    process.exit(0);
  });
}

/**
 * Configures the MCP server with the 'run_js_code' and prefixed tool handlers.
 */
function setupGatewayHandlers(server: Server, clientManager: McpClientManager, exposedTools: any[]) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      getRunJsCodeTool(Object.keys(TRUSTED_MCP_SERVERS)),
      ...exposedTools
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Route 1: Standard PTC Execution
    if (name === "run_js_code") {
      const { code } = args as { code: string };
      try {
        return await PTCExecutor.execute(code, clientManager);
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Gateway execution failed: ${e.message}` }],
          isError: true,
        };
      }
    }

    // Route 2: Direct Tool Exposure (Prefixed routing)
    const dotIndex = name.indexOf(".");
    if (dotIndex !== -1) {
      const serverName = name.substring(0, dotIndex);
      const toolName = name.substring(dotIndex + 1);

      if (TRUSTED_MCP_SERVERS[serverName]) {
        try {
          const client = await clientManager.getOrStartServer(serverName);
          return await client.callTool({ name: toolName, arguments: args });
        } catch (err: any) {
          return { content: [{ type: "text", text: `Proxy Error: ${err.message}` }], isError: true };
        }
      }
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  });
}
