import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { TRUSTED_MCP_SERVERS, McpServerConfig } from "./registry.js";
import { logger } from "../../core/logger.js";

/**
 * McpClientManager: Handles the lifecycle of downstream MCP client connections.
 * It caches active connections and supports both Stdio and SSE transports.
 */
export class McpClientManager {
    /**
     * Cache of active server connections.
     * Maps server name to a promise that resolves to the client and transport.
     */
    private activeServers = new Map<string, Promise<{ client: Client; transport: any }>>();

    /**
     * Retrieves an existing MCP client or starts a new one based on the registry configuration.
     * @param serverName The name of the server to connect to (must be in TRUSTED_MCP_SERVERS).
     */
    async getOrStartServer(serverName: string): Promise<Client> {
        const config = TRUSTED_MCP_SERVERS[serverName];
        if (!config) {
            throw new Error(`Security Violation: Unrecognized MCP server '${serverName}'`);
        }

        // Use cached connection if available
        if (!this.activeServers.has(serverName)) {
            const initPromise = this.initializeClient(serverName, config);
            this.activeServers.set(serverName, initPromise);
        }

        const { client } = await this.activeServers.get(serverName)!;
        return client;
    }

    /**
     * Initializes a new MCP client and connects it via the appropriate transport.
     */
    private async initializeClient(serverName: string, config: McpServerConfig) {
        const transport = await this.createTransport(config, serverName);
        const client = new Client(
            { name: `ptc-gateway-${serverName}`, version: "1.0" },
            { capabilities: {} }
        );

        await client.connect(transport);
        return { client, transport };
    }

    /**
     * Creates the appropriate transport (Stdio or SSE) based on the server configuration.
     */
    private async createTransport(config: McpServerConfig, serverName: string): Promise<any> {
        if (config.url) {
            logger.info(`Connecting to SSE: ${serverName} at ${config.url}`);
            return new SSEClientTransport(new URL(config.url));
        } 
        
        if (config.command) {
            logger.info(`Starting process: ${serverName}...`);
            return new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...process.env, ...config.env } as Record<string, string>
            });
        }

        throw new Error(`Invalid configuration for MCP server: ${serverName}`);
    }

    /**
     * Closes all active connections and clears the cache.
     */
    async closeAll() {
        for (const [serverName, serverPromise] of this.activeServers.entries()) {
            try {
                const { transport } = await serverPromise;
                logger.info(`Closing connection: ${serverName}`);
                await transport.close();
            } catch (e: any) {
                logger.error(`Failed to close ${serverName}: ${e.message}`);
            }
        }
        this.activeServers.clear();
    }

    /**
     * Pre-warms all registered servers and returns their tool definitions with prefixes.
     * This allows the Gateway to expose sub-server tools directly to the LLM.
     */
    async getExposedTools(): Promise<any[]> {
        const exposedTools: any[] = [];
        const serverNames = Object.keys(TRUSTED_MCP_SERVERS);

        await Promise.all(serverNames.map(async (serverName) => {
            try {
                const client = await this.getOrStartServer(serverName);
                const { tools } = await client.listTools();
                
                for (const tool of tools) {
                    exposedTools.push({
                        ...tool,
                        name: `${serverName}.${tool.name}`,
                        description: `[Proxy -> ${serverName}] ${tool.description}`
                    });
                }
                logger.info(`Successfully exposed ${tools.length} tools from '${serverName}'`);
            } catch (err: any) {
                logger.error(`Failed to expose tools from '${serverName}': ${err.message}`);
            }
        }));

        return exposedTools;
    }
}
