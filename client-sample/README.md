# PTC Client Samples

Welcome to the PTC (Programmatic Tool Calling) client samples. These scripts demonstrate how to integrate the PTC Gateway and Remote Orchestrator into your applications.

## 🏛 Structure

### 1. Gateway Mode (Stdio)
This mode is designed for **local desktop integrations** (like Cursor or Claude Desktop) where the server manages sub-processes (Chrome, Filesystem) directly.

- **`gateway/direct/`**: **Direct Tool Exposure**
  - `fs-list.js`: Call a sub-server tool directly by its prefix (e.g., `fs.list_directory`), bypassing the JS sandbox.
  - `chrome-nav.js`: Directly navigate pages using the `chrome` sub-server.
- **`gateway/ptc/`**: **Programmatic Orchestration**
  - `fs-parallel.js`: Use the JS sandbox to scan multiple directories in parallel.
  - `chrome-complex.js`: Perform stateful, multi-step browser automation (navigate + evaluate) in a single request.

### 2. Remote Mode (SSE)
This mode is designed for **cloud agents** where the brain and the tools live in different environments.

- **`remote/`**: **Remote Orchestration**
  - `backend-service.js`: Demonstrates the "Inversion of Control" loop where the server asks the client to execute a local tool and the client resumes the script with the results.

## 🚀 How to Run

1. **Build the PTC Server**:
   ```bash
   cd ..
   npm run build
   ```

2. **Run a sample**:
   From this directory:
   ```bash
   # Direct Call
   node gateway/direct/fs-list.js

   # PTC Orchestration
   node gateway/ptc/chrome-complex.js
   ```

3. **Check configuration**:
   Ensure `sub-mcp-servers.json` in this directory points to the correct commands (like `npx -y chrome-devtools-mcp`).
