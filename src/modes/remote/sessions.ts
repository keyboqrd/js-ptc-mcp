import { v4 as uuidv4 } from "uuid";
import { QuickJSSandbox } from "../../core/sandbox.js";
import { SandboxResult } from "../../core/types.js";
import { logger } from "../../core/logger.js";

interface Session {
  id: string;
  sandbox: QuickJSSandbox;
  createdAt: number;
}

export type SessionResult = SandboxResult & { sessionId?: string };

/**
 * SessionManager: Manages the lifecycle of sandboxed execution sessions.
 * Sessions are stored in memory and automatically cleaned up after a period of inactivity.
 */
export class SessionManager {
  /**
   * Active sessions mapped by their unique session ID.
   */
  private sessions = new Map<string, Session>();

  /**
   * The maximum time a session can remain idle before being destroyed (10 minutes).
   */
  private readonly SESSION_TTL = 1000 * 60 * 10;

  constructor() {
    // Schedule periodic cleanup of expired sessions
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Creates a new sandboxed execution session for the provided JS code.
   * If the execution suspends for tool calls, the session is persisted.
   */
  async createSession(code: string): Promise<SessionResult> {
    const sandbox = new QuickJSSandbox();
    await sandbox.init();

    const id = uuidv4();
    const result = sandbox.execute(code);

    if (result.status === "need_client_tool") {
      // The script is waiting for tool calls; save the sandbox state
      this.sessions.set(id, { id, sandbox, createdAt: Date.now() });
      return { ...result, sessionId: id };
    } 
    
    // Script finished or errored; no need to keep the session
    sandbox.dispose();
    return result;
  }

  /**
   * Resumes a previously suspended session with the results of its tool calls.
   */
  async resumeSession(id: string, toolResults: Record<string, any>): Promise<SessionResult> {
    const session = this.sessions.get(id);
    if (!session) {
      return { status: "error", error: "Session not found or has expired" };
    }

    try {
      const result = session.sandbox.resume(toolResults);

      if (result.status === "need_client_tool") {
        // Still waiting for more tool calls; refresh the session expiration
        session.createdAt = Date.now();
        return { ...result, sessionId: id };
      } 
      
      // Execution complete; clean up the session
      this.destroySession(id);
      return result;
    } catch (e: any) {
      this.destroySession(id);
      return { status: "error", error: e.message };
    }
  }

  /**
   * Cleans up the sandbox and removes the session from memory.
   */
  private destroySession(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.sandbox.dispose();
      this.sessions.delete(id);
    }
  }

  /**
   * Periodically checks for and removes expired sessions.
   */
  private cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.createdAt > this.SESSION_TTL) {
        logger.info(`Session ${id} expired and will be removed.`);
        this.destroySession(id);
      }
    }
  }
}
