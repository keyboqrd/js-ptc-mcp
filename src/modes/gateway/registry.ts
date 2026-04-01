import fs from "node:fs";
import path from "node:path";
import { logger } from "../../core/logger.js";

export interface McpServerConfig {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
}

/**
 * Loads the MCP server registry from a JSON file.
 * Defaults to 'sub-mcp-servers.json' in the current working directory.
 */
export function loadRegistry(configPath?: string): Record<string, McpServerConfig> {
    const defaultPath = path.resolve(process.cwd(), "sub-mcp-servers.json");
    const targetPath = configPath ? path.resolve(configPath) : defaultPath;


    if (!fs.existsSync(targetPath)) {
        logger.warn(`Registry config not found at ${targetPath}. Using empty registry.`);
        return {};
    }

    try {
        const content = fs.readFileSync(targetPath, "utf-8");
        const registry = JSON.parse(content);
        logger.info(`Loaded ${Object.keys(registry).length} servers from ${targetPath}`);
        return registry;
    } catch (err: any) {
        logger.error(`Failed to load registry: ${err.message}`);
        return {};
    }
}

// For backward compatibility and internal use, we'll keep a reference that can be updated.
export let TRUSTED_MCP_SERVERS: Record<string, McpServerConfig> = {};

export function setTrustedServers(servers: Record<string, McpServerConfig>) {
    TRUSTED_MCP_SERVERS = servers;
}
