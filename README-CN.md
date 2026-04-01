# QuickJS PTC MCP 服务端

[English (README.md)](./README.md)

一个用于实现程序化工具调用（**Programmatic Tool Calling - PTC**）的 MCP server 实现，支持 JavaScript 运行。

程序化工具使用的概念最早由 Anthropic Claude API 提出，允许模型编写代码以在单次会话中编排多个工具。本项目提供了一个**开源、模型无关的替代方案**，适用于原生 PTC 不可用的环境，通过标准 MCP 协议为任何 LLM（OpenAI、Gemini、本地模型等）带来同样强大的编排能力。

该服务端允许大语言模型 (LLM) 在安全、隔离的 **QuickJS WASM 沙箱**中执行复杂的、多步骤的工具编排，将执行逻辑从 LLM 的推理循环转移到确定性的本地执行中。

## 为什么选择 PTC？

传统的 LLM 工具使用依赖于顺序往返（*推理 -> 调用工具 A -> 等待 -> 推理 -> 调用工具 B*）。PTC 将这些多步骤依赖压缩到单个程序化执行脚本中，从而提供：

- **更低的延迟**：通过本地执行编排逻辑，消除网络和推理开销。
- **并发性**：支持使用 `Promise.all` 真正并行执行多个 MCP 工具。
- **控制流**：直接在沙箱中处理循环、条件判断和数据聚合，无需依赖 LLM 上下文。
- **上下文效率**：仅将最终提炼的数据结构返回到 LLM 的上下文窗口。

---

## 快速开始

### 1. 安装
全局安装或作为依赖安装：
```bash
npm install -g js-ptc-mcp
```
或者进行本地开发：
```bash
npm install
npm run build
```

### 2. 选择模式并运行

PTC MCP 根据您的部署拓扑支持两种不同的架构。

#### 模式 A：网关模式 (Gateway Mode) - 适用于标准客户端（如 Cursor, Claude Desktop）
作为使用 STDIO 的透明代理运行。它根据配置文件动态启动本地子 MCP 服务端（如 Chrome, SQLite），并在内部执行 JS 微循环。

1. 在项目根目录创建 `sub-mcp-servers.json` 来定义基础工具：
    ```json
    {
      "chrome": {
        "command": "npx",
        "args": ["-y", "chrome-devtools-mcp@latest"]
      },
      "fs": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
      }
    }
    ```
2. 启动网关：
    ```bash
    # 如果已全局安装
    js-ptc-mcp gateway

    # 用于本地开发
    npm run gateway
    ```
3. **连接您的客户端**：配置您的 MCP 客户端执行 `node path/to/dist/cli.js gateway`。

> **💡 最佳实践：直接暴露工具**
> 为了防止端口冲突和资源耗尽，如果工具（如 `chrome-devtools-mcp`）已由 PTC 网关管理，请 **不要** 在客户端配置中直接注册它们。网关会自动将所有子工具（如 `chrome.navigate_page`）暴露给 LLM。LLM 可以选择编写 JS 脚本执行复杂任务，也可以直接调用暴露的工具执行单一操作。

#### 模式 B：远程模式 (Remote Mode) - 适用于自定义云端 Agent
作为使用 SSE (Server-Sent Events) 的编排器运行。它本身不执行任何工具，而是依赖控制反转 (IoC) 来挂起执行，并请求您的安全后端执行操作。

1. 将 `.env.example` 复制为 `.env` 并配置您的 `PTC_API_KEY`。
2. 启动 SSE 服务端：
    ```bash
    # 默认端口为 3000
    npm run remote -- --port 3000
    ```

---

## 沙箱环境

QuickJS WASM 环境是严格沙箱化的，专注于状态机编排、数据操作以及**通用逻辑执行**。它既可以用于复杂的工具链调用，也可以用于简单的纯 JavaScript 计算或数据转换。

- **可用**：`call_client_tool("alias.tool_name", args)`、`print(data)`、`async/await`、`Promise.all` 以及标准 ES2022 原语（Math, Date, Array, String 等）。
- **限制**：**没有** `fetch`，**没有** 定时器 (`setTimeout`)，也 **没有** Node.js/浏览器 API。所有外部交互必须通过 `call_client_tool` 进行。

### LLM 脚本示例

**场景 A：纯 JavaScript 计算**
```javascript
const fib = (n) => n <= 1 ? n : fib(n - 1) + fib(n - 2);
return { result: fib(10) };
```

**场景 B：工具编排**
```javascript
print("1. 开始并行获取数据...");

// 并发执行多个底层 MCP 工具
const [user, config] = await Promise.all([
  call_client_tool("db.get_user", { id: 123 }),
  call_client_tool("fs.read_file", { path: "config.json" })
]);

// 在沙箱内处理条件逻辑
if (user.isAdmin) {
  print("2. 检测到管理员，应用特殊配置...");
  await call_client_tool("db.update", { id: 123, status: "active" });
}

// 将提炼后的结果返回给 LLM 上下文
return { 
  username: user.name, 
  settings: config.theme 
};
```

---

## 架构哲学

<details>
<summary><b>理解两种模式</b></summary>

在集成 PTC 时，开发者面临一个关键的抉择：**底层工具驻留在哪里，由谁执行？**

1. **网关模式 (STDIO)**：标准客户端（如 Cursor）是无状态的调度器，无法处理挂起/恢复循环。网关模式通过将会话循环保持在内部来解决此问题。它充当本地子进程的“黑盒”路由器，非常适合本地开发环境。
2. **远程模式 (SSE)**：自定义云端 Agent（如 SaaS 平台）通常使用私有的后端 API。从远程沙箱直接执行这些 API 会引入安全风险。远程模式利用 SSE 向您的后端流式传输“挂起/中断”信号，允许您的安全环境执行工具并将结果注入回沙箱。非常适合分布式 Web 架构。

这两种模式共享 **100% 相同的底层 QuickJS 确定性状态机**，无论部署策略如何，都能确保内存安全和并发性。
</details>

---

## 开发结构

- `src/core/`: 引擎核心（沙箱、逻辑、状态机）。
- `src/modes/`: 网关模式 (STDIO) 和远程模式 (SSE) 服务端的实现。
- `client-sample/`: 演示每种模式的 Node.js 客户端示例。

## 许可证
MIT
