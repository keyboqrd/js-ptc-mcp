import { QuickJSSandbox } from "../../core/sandbox.js";
import { McpClientManager } from "./manager.js";

/**
 * PTCExecutor: Orchestrates the execution of sandboxed JS code 
 * by resolving tool calls against local or remote MCP servers.
 * This is used by the Gateway (Stdio) mode for synchronous execution.
 */
export class PTCExecutor {
    /**
     * Executes the script and recursively handles any tool calls emitted by the sandbox.
     */
    static async execute(code: string, clientManager: McpClientManager) {
        const sandbox = new QuickJSSandbox();

        try {
            await sandbox.init();
            let state = sandbox.execute(code);

            // Synchronously resolve tool calls as long as the sandbox needs them
            while (state.status === "need_client_tool") {
                const toolResults = await this.resolveToolCalls(state.toolCalls!, clientManager);
                state = sandbox.resume(toolResults);
            }

            return this.formatResult(state);
        } finally {
            sandbox.dispose();
        }
    }

    /**
     * Executes all concurrent tool calls in parallel and collects their results.
     */
    private static async resolveToolCalls(toolCalls: any[], clientManager: McpClientManager): Promise<Record<string, any>> {
        const toolResults: Record<string, any> = {};

        await Promise.all(toolCalls.map(async (call) => {
            try {
                const { serverName, toolName } = this.parseToolName(call.toolName);
                const client = await clientManager.getOrStartServer(serverName);

                // Execute the tool call via the downstream MCP client
                const response = await client.callTool({ name: toolName, arguments: call.args }) as any;
                
                // Parse and store the result
                toolResults[call.callId] = this.extractTextResult(response);
            } catch (err: any) {
                // Return errors in a format the sandbox can handle
                toolResults[call.callId] = { __is_error: true, message: err.message };
            }
        }));

        return toolResults;
    }

    /**
     * Parses "server.tool" into { serverName, toolName }.
     */
    private static parseToolName(fullName: string) {
        const dotIndex = fullName.indexOf(".");
        if (dotIndex === -1) {
            throw new Error(`Invalid tool format. Expected 'server.tool', got '${fullName}'`);
        }
        return {
            serverName: fullName.substring(0, dotIndex),
            toolName: fullName.substring(dotIndex + 1)
        };
    }

    /**
     * Extracts and joins all text content from an MCP tool response.
     */
    private static extractTextResult(response: any) {
        let resultData = response.content.map((c: any) => c.text).join("\n");
        try { 
            return JSON.parse(resultData); 
        } catch (_) { 
            return resultData; 
        }
    }

    /**
     * Formats the final sandbox state into a standard MCP tool response.
     */
    private static formatResult(state: any) {
        if (state.status === "error") {
            return { 
                content: [{ type: "text", text: `Sandbox Error: ${state.error}` }], 
                isError: true 
            };
        }

        return { 
            content: [{ 
                type: "text", 
                text: typeof state.result === "string" ? state.result : JSON.stringify(state.result, null, 2) 
            }] 
        };
    }
}
