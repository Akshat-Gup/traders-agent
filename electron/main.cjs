const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ICON_PATH = path.join(__dirname, "..", "src", "logo.jpg");

const BACKEND_PORT = process.env.BACKEND_PORT || "8765";
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
let backendProcess = null;
let backendLog = "";

function detectPython() {
  const repoRoot = path.resolve(__dirname, "..");
  const venvPython = path.join(repoRoot, ".venv", "bin", "python3");
  if (fs.existsSync(venvPython)) return venvPython;
  // also try python3.14 or python3
  return "python3";
}

function startBackend() {
  if (backendProcess) return;

  const repoRoot = path.resolve(__dirname, "..");
  const python = detectPython();

  backendProcess = spawn(
    python,
    ["-m", "backend.main", "--host", "127.0.0.1", "--port", BACKEND_PORT],
    {
      cwd: repoRoot,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  backendProcess.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    backendLog += text;
    if (backendLog.length > 20000) {
      backendLog = backendLog.slice(-20000);
    }
  });

  backendProcess.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    backendLog += text;
    if (backendLog.length > 20000) {
      backendLog = backendLog.slice(-20000);
    }
  });

  backendProcess.on("exit", (code) => {
    console.log("[backend] exited with code", code);
    backendProcess = null;
  });
}

/** Poll /health until the backend answers, then resolve. */
function waitForBackend(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function poll() {
      const req = http.get(`${BACKEND_URL}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });
      req.on("error", retry);
      req.setTimeout(500, () => { req.destroy(); retry(); });
    }

    function retry() {
      if (Date.now() > deadline) {
        reject(new Error("Backend did not start in time"));
        return;
      }
      setTimeout(poll, 300);
    }

    poll();
  });
}

function createWindow() {
  const icon = fs.existsSync(ICON_PATH) ? nativeImage.createFromPath(ICON_PATH) : null;
  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    minHeight: 780,
    backgroundColor: "#f5f4f1",
    titleBarStyle: "hiddenInset",
    title: "Traders",
    ...(icon && !icon.isEmpty() && { icon }),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });
    // Only open devtools if explicitly requested
    if (process.env.DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  app.setName("Traders");
  if (process.platform === "darwin" && fs.existsSync(ICON_PATH)) {
    try {
      app.dock.setIcon(ICON_PATH);
    } catch (_) {}
  }
  // In dev, backend is already running via run_backend.sh
  if (!process.env.VITE_DEV_SERVER_URL) {
    startBackend();
  }

  // Register IPC handlers immediately (don't need backend for these)
  ipcMain.handle("dialog:pickPaths", async (_, options = {}) => {
    const properties = [];
    if (options.mode === "folders") {
      properties.push("openDirectory");
    } else if (options.mode === "mixed") {
      properties.push("openFile", "openDirectory");
    } else {
      properties.push("openFile");
    }
    if (options.multiple !== false) {
      properties.push("multiSelections");
    }
    const result = await dialog.showOpenDialog({
      title: options.title || "Choose items",
      properties
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("desktop:getBackendUrl", async () => BACKEND_URL);
  ipcMain.handle("desktop:openPath", async (_, targetPath) => shell.openPath(targetPath));
  ipcMain.handle("desktop:getBackendLog", async () => backendLog);
  ipcMain.handle("desktop:focusTerminal", async () => {
    if (process.platform === "darwin") {
      const { exec } = require("node:child_process");
      exec(`osascript -e 'tell application "Terminal" to activate'`);
    }
  });

  // Wait for backend to be ready before showing the window
  try {
    await waitForBackend(20000);
    console.log("[electron] backend ready");
  } catch (e) {
    console.error("[electron] backend failed to start:", e.message);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendProcess) backendProcess.kill();
});
