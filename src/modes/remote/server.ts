import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { SessionManager } from "./sessions.js";
import { logger } from "../../core/logger.js";
import { getRunJsCodeTool, RESUME_JS_CODE_TOOL } from "../../core/definitions.js";
import "dotenv/config";

/**
 * Starts the PTC Remote server using SSE (Server-Sent Events) transport.
 * This mode is designed for云端 orchestrators where tool calls are resolved by the client.
 */
export async function startRemoteServer(port: number) {
  const app = express();
  // app.use(express.json()); // SSE handles body parsing; express.json() might consume the stream

  // API Key Authentication Middleware
  const apiKey = process.env.PTC_API_KEY;
  if (apiKey) {
    logger.info("API Key authentication enabled.");
    app.use((req, res, next) => {
      const providedKey = req.headers["x-api-key"];
      if (providedKey !== apiKey) {
        logger.error(`Unauthorized access attempt from ${req.ip}`);
        res.status(401).send("Unauthorized: Invalid or missing x-api-key header.");
        return;
      }
      next();
    });
  } else {
    logger.info("API Key authentication disabled (PTC_API_KEY not set in .env).");
  }

  const sessionManager = new SessionManager();

  const server = new Server(
    { name: "quickjs-ptc-remote", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  /**
   * Tracks active SSE connections by their unique session/endpoint ID.
   */
  const transports = new Map<string, SSEServerTransport>();

  // Register MCP Tool handlers
  setupServerHandlers(server, sessionManager);

  /**
   * SSE Endpoint: Establishes a long-running connection with the client.
   * Generates a unique session ID for the message endpoint.
   */
  app.get("/sse", async (req, res) => {
    logger.info("New SSE connection received.");
    const sessionId = Math.random().toString(36).substring(7);
    const transport = new SSEServerTransport(`/messages/${sessionId}`, res);

    transports.set(sessionId, transport);
    transport.onclose = () => {
      logger.info(`SSE connection ${sessionId} closed.`);
      transports.delete(sessionId);
    };

    await server.connect(transport);
  });

  /**
   * Message Endpoint: Receives JSON-RPC messages from the client.
   * Routes the message to the corresponding SSEServerTransport.
   */
  app.post("/messages/:id", async (req, res) => {
    const sessionId = req.params.id;
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(400).send("Invalid or expired session ID.");
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  app.listen(port, () => {
    logger.info(`Remote SSE Server listening on port ${port}`);
    logger.info(`Endpoint: http://localhost:${port}/sse`);
  });
}

/**
 * Configures the MCP server with 'run_js_code' and 'resume_js_code' handlers.
 */
function setupServerHandlers(server: Server, sessionManager: SessionManager) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [getRunJsCodeTool(), RESUME_JS_CODE_TOOL],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    switch (request.params.name) {
      case "run_js_code":
        return await handleRunJsCode(request, sessionManager);
      case "resume_js_code":
        return await handleResumeJsCode(request, sessionManager);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
  });
}

/**
 * Tool Handler: 'run_js_code'
 */
async function handleRunJsCode(request: any, sessionManager: SessionManager) {
  const { code } = request.params.arguments as { code: string };
  try {
    const result = await sessionManager.createSession(code);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (e: any) {
    return { content: [{ type: "text", text: `Execution failed: ${e.message}` }], isError: true };
  }
}

/**
 * Tool Handler: 'resume_js_code'
 */
async function handleResumeJsCode(request: any, sessionManager: SessionManager) {
  const { session_id, tool_results } = request.params.arguments as {
    session_id: string;
    tool_results: Record<string, any>;
  };
  try {
    const result = await sessionManager.resumeSession(session_id, tool_results);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (e: any) {
    return { content: [{ type: "text", text: `Resume failed: ${e.message}` }], isError: true };
  }
}
