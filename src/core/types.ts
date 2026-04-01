export interface ToolCall {
  callId: string;
  toolName: string;
  args: any;
}

export interface SandboxResult {
  status: "success" | "need_client_tool" | "error";
  result?: any;
  toolCalls?: ToolCall[];
  error?: string;
}
