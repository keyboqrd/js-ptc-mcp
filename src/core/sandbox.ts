import { newQuickJSAsyncWASMModule, QuickJSAsyncRuntime, QuickJSAsyncContext, QuickJSDeferredPromise } from "quickjs-emscripten";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger.js";
import { SandboxResult, ToolCall } from "./types.js";

/**
 * QuickJSSandbox: A secure, asynchronous JavaScript execution environment.
 * It manages a QuickJS instance and provides a mechanism to pause execution
 * when a script requests a tool call that must be handled by the host.
 */
export class QuickJSSandbox {
  private runtime: QuickJSAsyncRuntime | null = null;
  private context: QuickJSAsyncContext | null = null;

  /** 
   * Tracks pending tool calls that have suspended the script execution.
   * Maps unique call IDs to their respective QuickJS deferred promises.
   */
  private pendingDeferreds = new Map<string, QuickJSDeferredPromise>();
  private pendingToolCalls: ToolCall[] = [];

  /**
   * Initializes the QuickJS WASM module and sets up the execution context.
   * Injects the `print` and `call_client_tool` global functions.
   */
  async init() {
    const module = await newQuickJSAsyncWASMModule();
    this.runtime = module.newRuntime({ maxStackSizeBytes: 1024 * 1024 });
    this.context = this.runtime.newContext();

    this.setupGlobals();
  }

  /**
   * Injects global functions into the sandbox environment.
   */
  private setupGlobals() {
    if (!this.context) return;

    // 1. Inject 'print' for logging inside the sandbox
    const logHandle = this.context.newFunction("print", (...args) => {
      const nativeArgs = args.map(arg => this.context!.dump(arg));
      logger.info(`[Sandbox Script]`, ...nativeArgs);
    });
    this.context.setProp(this.context.global, "print", logHandle);
    logHandle.dispose();

    // 2. Inject internal tool interceptor
    // This function is called by the global 'call_client_tool' wrapper
    const callToolHandle = this.context.newFunction("_call_client_tool_internal", (toolNameHandle, argsStrHandle) => {
      const toolName = this.context!.getString(toolNameHandle);
      const argsStr = this.context!.getString(argsStrHandle);

      const callId = `call_${uuidv4().replace(/-/g, '')}`;
      const deferred = this.context!.newPromise();

      this.pendingDeferreds.set(callId, deferred);
      this.pendingToolCalls.push({ callId, toolName, args: JSON.parse(argsStr) });

      // Return the promise handle to QuickJS to suspend the async function
      return deferred.handle;
    });
    this.context.setProp(this.context.global, "_call_client_tool_internal", callToolHandle);
    callToolHandle.dispose();

    // 3. Inject global async wrapper for a cleaner API
    const wrapperRes = this.context.evalCode(`
      globalThis.call_client_tool = async function(name, args) {
        const resultStr = await _call_client_tool_internal(name, JSON.stringify(args));
        if (!resultStr) return undefined;
        const parsed = JSON.parse(resultStr);
        if (parsed && parsed.__is_error) throw new Error(parsed.message);
        return parsed;
      };
    `);
    wrapperRes.unwrap().dispose();
  }

  /**
   * Pumps the QuickJS event loop to execute pending jobs and microtasks.
   * Returns a SandboxResult indicating if the script finished, errored, or is waiting for tools.
   */
  private pump(): SandboxResult {
    try {
      let hasMore = true;
      while (hasMore) {
        const executeResult = this.runtime!.executePendingJobs();
        if (typeof executeResult === "object" && executeResult !== null && "error" in executeResult) {
          const errHandle = (executeResult as any).error;
          const errDump = this.context!.dump(errHandle);
          errHandle.dispose();
          return { status: "error", error: errDump.message || String(errDump) };
        }
        hasMore = this.runtime!.hasPendingJob();
      }

      // If we have collected tool calls during the pump, notify the host
      if (this.pendingToolCalls.length > 0) {
        const calls = this.pendingToolCalls;
        this.pendingToolCalls = []; // Reset for next suspension
        return { status: "need_client_tool", toolCalls: calls };
      }

      // Check global state variables for the final result or error
      const errorHandle = this.context!.getProp(this.context!.global, "__ptc_error");
      const resultHandle = this.context!.getProp(this.context!.global, "__ptc_result");

      if (this.context!.typeof(errorHandle) !== "undefined") {
        const errDump = this.context!.dump(errorHandle);
        errorHandle.dispose(); resultHandle.dispose();
        return { status: "error", error: errDump.message || String(errDump) };
      }

      if (this.context!.typeof(resultHandle) !== "undefined") {
        const resDump = this.context!.dump(resultHandle);
        errorHandle.dispose(); resultHandle.dispose();
        return { status: "success", result: resDump };
      }

      errorHandle.dispose(); resultHandle.dispose();
      return { status: "error", error: "Script deadlocked: Promise did not resolve." };
    } catch (e: any) {
      return { status: "error", error: e.message || String(e) };
    }
  }

  /**
   * Starts execution of the provided JavaScript code.
   */
  execute(code: string): SandboxResult {
    if (!this.context) throw new Error("Sandbox not initialized");

    const wrappedCode = `
      globalThis.__ptc_result = undefined;
      globalThis.__ptc_error = undefined;
      (async () => {
         return await (async () => {\n${code}\n})();
      })().then(res => {
         globalThis.__ptc_result = res !== undefined ? res : null;
      }).catch(err => {
         globalThis.__ptc_error = err !== undefined ? err : new Error("Unknown error");
      });
    `;

    const result = this.context.evalCode(wrappedCode);
    if (result.error) {
      const errDump = this.context.dump(result.error);
      result.error.dispose();
      return { status: "error", error: `Syntax Error: ${errDump.message}` };
    }
    (result as any).value.dispose();

    return this.pump();
  }

  /**
   * Resumes execution by resolving the pending tool calls with their results.
   */
  resume(toolResults: Record<string, any>): SandboxResult {
    for (const [callId, result] of Object.entries(toolResults)) {
      const deferred = this.pendingDeferreds.get(callId);
      if (deferred) {
        const jsonStr = result === undefined ? "" : JSON.stringify(result);
        const strHandle = this.context!.newString(jsonStr);
        deferred.resolve(strHandle);
        strHandle.dispose();
        deferred.dispose();
        this.pendingDeferreds.delete(callId);
      }
    }
    return this.pump();
  }

  /**
   * Clean up resources used by the sandbox.
   */
  dispose() {
    for (const deferred of this.pendingDeferreds.values()) {
      deferred.dispose();
    }
    this.pendingDeferreds.clear();
    this.context?.dispose();
    this.runtime?.dispose();
  }
}
