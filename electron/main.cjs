const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const BACKEND_PORT = process.env.BACKEND_PORT || "8765";
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
let backendProcess = null;

function detectPython() {
  const repoRoot = __dirname ? path.resolve(__dirname, "..") : process.cwd();
  const venvPython = path.join(repoRoot, ".venv", "bin", "python3");
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return "python3";
}

function startBackend() {
  if (backendProcess) {
    return;
  }

  const repoRoot = path.resolve(__dirname, "..");
  const python = detectPython();

  backendProcess = spawn(
    python,
    ["-m", "backend.main", "--host", "127.0.0.1", "--port", BACKEND_PORT],
    {
      cwd: repoRoot,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: "inherit"
    }
  );

  backendProcess.on("exit", () => {
    backendProcess = null;
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1180,
    minHeight: 820,
    backgroundColor: "#0b1116",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  startBackend();

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

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
