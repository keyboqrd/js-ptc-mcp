#!/usr/bin/env node
import { Command } from "commander";
import { startRemoteServer } from "./modes/remote/server.js";
import { startGatewayServer } from "./modes/gateway/server.js";
import { loadRegistry } from "./modes/gateway/registry.js";
import { logger } from "./core/logger.js";

const program = new Command();

program
  .name("js-ptc-mcp")
  .description("Programmatic Tool Call (PTC) Engine for MCP");

program
  .command("gateway")
  .description("Start as a Transparent Gateway (Best for Cursor/Claude Desktop)")
  .option("-c, --config <path>", "Path to sub-mcp-servers.json configuration file")
  .action(async (options) => {
    try {
      const servers = loadRegistry(options.config);
      await startGatewayServer(servers);
    } catch (err: any) {
      logger.error(`Gateway Server Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("remote")
  .description("Start as a Remote Orchestrator (Best for custom Agents via SSE)")
  .option("-p, --port <number>", "Port for SSE HTTP Server", "3000")
  .action(async (options) => {
    try {
      await startRemoteServer(parseInt(options.port));
    } catch (err: any) {
      logger.error(`Remote Server Error: ${err.message}`);
      process.exit(1);
    }
  });

// Handle unknown commands
program.on("command:*", () => {
  logger.error(`Invalid command: ${program.args.join(" ")}\nSee --help for a list of available commands.`);
  process.exit(1);
});

// Default to help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} else {
  program.parse(process.argv);
}
