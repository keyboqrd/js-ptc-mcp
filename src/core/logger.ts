import { warn } from "console";

/**
 * Simple internal logger to handle transport-specific logging requirements.
 */
export const logger = {
    info: (message: string, ...args: any[]) => {
        // MCP Stdio must use stderr. SSE can use stdout. 
        // We default to error/stderr as it's the safest cross-platform baseline for MCP.
        console.error(`[INFO] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
        console.error(`[WARN] ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
        console.error(`[ERROR] ${message}`, ...args);
    },
    debug: (message: string, ...args: any[]) => {
        console.error(`[DEBUG] ${message}`, ...args);
    }
};
