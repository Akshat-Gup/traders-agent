const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { CodexAppServerClient } = require("./codexAppServer.cjs");
const localState = require("./localState.cjs");

const ICON_PATH = path.join(__dirname, "..", "src", "logo.jpg");

const codexClient = new CodexAppServerClient();
const jobSessions = new Map();
const threadToJob = new Map();
const pendingServerRequests = new Map();
let accountSnapshot = {
  account: null,
  requiresOpenaiAuth: true,
  authMode: null,
};

function codexInstalled() {
  const probe = spawnSync("codex", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
}

function sendToWindows(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function listFiles(rootPath, basePath = rootPath, depth = 0, maxDepth = 3, bucket = []) {
  if (!fs.existsSync(rootPath) || depth > maxDepth) return bucket;
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    const relativePath = path.relative(basePath, absolutePath) || entry.name;
    const stats = fs.statSync(absolutePath);
    bucket.push({
      name: entry.name,
      path: absolutePath,
      relativePath,
      kind: entry.isDirectory() ? "directory" : "file",
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    });
    if (entry.isDirectory()) {
      listFiles(absolutePath, basePath, depth + 1, maxDepth, bucket);
    }
  }
  return bucket;
}

function emptySession(job) {
  return {
    jobId: job.id,
    threadId: job.thread_id || null,
    activeTurnId: job.active_turn_id || null,
    codexStatus: job.codex_status || "idle",
    lastEventAt: job.last_event_at || null,
    agentText: job.last_agent_text || "",
    commandOutput: job.last_command_output || "",
    fileChanges: [],
    approvals: [],
    lastError: null,
    running: job.status === "agent_running",
  };
}

function getOrCreateSession(jobId) {
  const existing = jobSessions.get(jobId);
  if (existing) return existing;
  const job = localState.getJob(jobId);
  if (!job) throw new Error("Job not found");
  const session = emptySession(job);
  jobSessions.set(jobId, session);
  if (session.threadId) {
    threadToJob.set(session.threadId, jobId);
  }
  return session;
}

function persistSession(jobId, extra = {}) {
  const session = jobSessions.get(jobId);
  if (!session) return null;
  return localState.updateJob(jobId, {
    thread_id: session.threadId,
    active_turn_id: session.activeTurnId,
    codex_status: session.codexStatus,
    last_event_at: session.lastEventAt,
    approval_pending: session.approvals.length > 0,
    last_agent_text: session.agentText.slice(-40000),
    last_command_output: session.commandOutput.slice(-40000),
    ...extra,
  });
}

function broadcastSession(jobId) {
  const session = jobSessions.get(jobId);
  if (!session) return;
  sendToWindows("codex:event", {
    type: "session",
    jobId,
    session: clone(session),
  });
}

function updateSession(jobId, updater, extraPersist = {}) {
  const session = getOrCreateSession(jobId);
  updater(session);
  session.lastEventAt = new Date().toISOString();
  persistSession(jobId, extraPersist);
  broadcastSession(jobId);
  return session;
}

function resolveJobIdFromThread(threadId) {
  if (!threadId) return null;
  return threadToJob.get(threadId) || null;
}

function normalizeSandboxMode(value) {
  if (value === "danger-full-access") return "danger-full-access";
  if (value === "read-only") return "read-only";
  return "workspace-write";
}

function buildRunInstruction(job) {
  const parts = [
    "Read `context/prompt.md` and execute the task from this workspace.",
    "Use `context/answers.md` for any appended context from the user.",
    "If `source/urls/urls.txt` exists, review those URLs as part of the task.",
    "Write finished deliverables to `result/` only.",
    "Keep the conversation updated with concise progress notes while you work.",
  ];
  if (job.kind === "update") {
    parts.push("Use web research when needed to make the update current.");
  }
  return parts.join(" ");
}

async function ensureCodexReady() {
  if (!codexInstalled()) {
    throw new Error("Codex CLI is not installed on this machine.");
  }
  await codexClient.start();
  return syncAccount();
}

async function syncAccount() {
  try {
    const result = await codexClient.request("account/read", { refreshToken: false });
    accountSnapshot = {
      account: result.account || null,
      requiresOpenaiAuth: Boolean(result.requiresOpenaiAuth),
      authMode:
        result.account?.type === "apiKey"
          ? "apikey"
          : result.account?.type === "chatgpt"
          ? "chatgpt"
          : accountSnapshot.authMode,
    };
  } catch {
    accountSnapshot = {
      account: null,
      requiresOpenaiAuth: true,
      authMode: null,
    };
  }
  sendToWindows("codex:event", {
    type: "account",
    account: clone(accountSnapshot),
  });
  return accountSnapshot;
}

async function loginWithCodex() {
  await ensureCodexReady();
  const result = await codexClient.request("account/login/start", { type: "chatgpt" });
  if (result.authUrl) {
    await shell.openExternal(result.authUrl);
  }
  return result;
}

async function launchJob(jobId) {
  const account = await ensureCodexReady();
  if (!account.account && account.requiresOpenaiAuth) {
    throw new Error("Codex is not signed in. Use Connect Codex first.");
  }

  const job = localState.getJob(jobId);
  if (!job) throw new Error("Job not found");

  const settings = localState.readSettings();
  let threadId = job.thread_id;

  updateSession(
    jobId,
    (session) => {
      session.running = true;
      session.codexStatus = "starting";
      session.lastError = null;
    },
    {
      status: "agent_running",
    }
  );

  if (threadId) {
    try {
      const resumed = await codexClient.request("thread/resume", {
        threadId,
        cwd: job.workspace_path,
        approvalPolicy: settings.approval_policy,
        sandbox: normalizeSandboxMode(settings.sandbox),
        personality: settings.personality,
      });
      threadId = resumed.thread.id;
    } catch {
      threadId = null;
      localState.updateJob(jobId, { thread_id: null, active_turn_id: null });
    }
  }

  if (!threadId) {
    const started = await codexClient.request("thread/start", {
      cwd: job.workspace_path,
      approvalPolicy: settings.approval_policy,
      sandbox: normalizeSandboxMode(settings.sandbox),
      personality: settings.personality,
      serviceName: "traders_desktop",
    });
    threadId = started.thread.id;
  }

  threadToJob.set(threadId, jobId);
  updateSession(jobId, (session) => {
    session.threadId = threadId;
  });

  const turn = await codexClient.request("turn/start", {
    threadId,
    cwd: job.workspace_path,
    approvalPolicy: settings.approval_policy,
    personality: settings.personality,
    input: [
      {
        type: "text",
        text: buildRunInstruction(localState.getJob(jobId)),
      },
    ],
  });

  updateSession(
    jobId,
    (session) => {
      session.activeTurnId = turn.turn.id;
      session.codexStatus = "running";
    },
    {
      status: "agent_running",
    }
  );

  return {
    status: "launched",
    threadId,
    turnId: turn.turn.id,
  };
}

async function respondToServerRequest(requestId, decision) {
  const request = pendingServerRequests.get(requestId);
  if (!request) {
    throw new Error("Approval request not found.");
  }
  pendingServerRequests.delete(requestId);
  codexClient.respond(requestId, decision);

  const jobId = resolveJobIdFromThread(request.params?.threadId);
  if (jobId) {
    updateSession(jobId, (session) => {
      session.approvals = session.approvals.filter((approval) => approval.requestId !== requestId);
    });
  }
  return { ok: true };
}

function listJobOutputs(jobId) {
  const job = localState.getJob(jobId);
  if (!job) throw new Error("Job not found");
  return listFiles(job.result_path)
    .filter((entry) => entry.kind === "file")
    .sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
}

function handleServerRequest(message) {
  if (message.method === "account/chatgptAuthTokens/refresh") {
    codexClient.respondError(message.id, -32000, "Externally managed ChatGPT tokens are not enabled in this app.");
    return;
  }

  if (message.method !== "item/commandExecution/requestApproval" && message.method !== "item/fileChange/requestApproval") {
    codexClient.respondError(message.id, -32000, `Unsupported server request: ${message.method}`);
    return;
  }

  pendingServerRequests.set(message.id, message);
  const jobId = resolveJobIdFromThread(message.params.threadId);
  if (!jobId) return;

  updateSession(jobId, (session) => {
    session.approvals = [
      ...session.approvals.filter((approval) => approval.requestId !== message.id),
      {
        requestId: message.id,
        method: message.method,
        itemId: message.params.itemId,
        threadId: message.params.threadId,
        turnId: message.params.turnId,
        reason: message.params.reason || null,
        command: message.params.command || null,
        cwd: message.params.cwd || null,
        grantRoot: message.params.grantRoot || null,
      },
    ];
    session.codexStatus = "waiting-on-approval";
  });
}

function handleNotification(message) {
  if (message.method === "account/updated" || message.method === "account/login/completed") {
    syncAccount().catch(() => {});
    return;
  }

  const params = message.params || {};
  const threadId = params.threadId || params.thread?.id || null;
  const jobId = resolveJobIdFromThread(threadId);
  if (!jobId) return;

  if (message.method === "thread/status/changed") {
    updateSession(jobId, (session) => {
      session.codexStatus = params.status?.type || "idle";
    });
    return;
  }

  if (message.method === "item/agentMessage/delta") {
    updateSession(jobId, (session) => {
      session.agentText += params.delta || "";
      session.running = true;
      session.codexStatus = "running";
      session.activeTurnId = params.turnId;
    });
    return;
  }

  if (message.method === "item/commandExecution/outputDelta") {
    updateSession(jobId, (session) => {
      session.commandOutput += params.delta || "";
      session.running = true;
      session.codexStatus = "running";
      session.activeTurnId = params.turnId;
    });
    return;
  }

  if (message.method === "item/started" || message.method === "item/completed") {
    const item = params.item || {};
    updateSession(jobId, (session) => {
      session.activeTurnId = params.turnId || session.activeTurnId;
      if (item.type === "agentMessage" && typeof item.text === "string" && item.text.length >= session.agentText.length) {
        session.agentText = item.text;
      }
      if (item.type === "commandExecution" && typeof item.aggregatedOutput === "string" && item.aggregatedOutput.length >= session.commandOutput.length) {
        session.commandOutput = item.aggregatedOutput;
      }
      if (item.type === "fileChange" && Array.isArray(item.changes)) {
        session.fileChanges = item.changes;
        if (item.status === "completed") {
          session.approvals = session.approvals.filter((approval) => approval.itemId !== item.id);
        }
      }
      if (message.method === "item/completed" && item.type === "commandExecution" && item.status === "failed") {
        session.lastError = `Command failed${typeof item.exitCode === "number" ? ` (exit ${item.exitCode})` : ""}`;
      }
    });
    return;
  }

  if (message.method === "turn/completed") {
    updateSession(
      jobId,
      (session) => {
        session.running = false;
        session.activeTurnId = null;
        session.codexStatus = params.turn?.status || "completed";
        session.lastError = params.turn?.error?.message || null;
        session.approvals = [];
      },
      {
        status:
          params.turn?.status === "completed"
            ? "done"
            : params.turn?.status === "failed"
            ? "error"
            : "ready",
        approval_pending: false,
      }
    );
  }
}

codexClient.on("serverRequest", handleServerRequest);
codexClient.on("notification", handleNotification);
codexClient.on("exit", () => {
  sendToWindows("codex:event", {
    type: "server-exit",
    log: codexClient.getLog(),
  });
});

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
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });
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
    } catch {
      // Ignore icon failures.
    }
  }

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
      properties,
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("desktop:openPath", async (_, targetPath) => shell.openPath(targetPath));
  ipcMain.handle("desktop:getBackendLog", async () => codexClient.getLog());
  ipcMain.handle("desktop:focusTerminal", async () => {
    const focused = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    focused?.focus();
  });

  ipcMain.handle("state:get", async () => localState.getState({ executorAvailable: codexInstalled() }));
  ipcMain.handle("project:create", async (_, payload) => localState.createProject(payload));
  ipcMain.handle("job:create", async (_, payload) => localState.createJob(payload));
  ipcMain.handle("job:appendQa", async (_, { jobId, content }) => localState.appendJobQa(jobId, content));
  ipcMain.handle("job:listOutputs", async (_, jobId) => listJobOutputs(jobId));
  ipcMain.handle("updateDefinition:create", async (_, payload) => localState.createUpdateDefinition(payload));
  ipcMain.handle("updateDefinition:run", async (_, definitionId) => localState.runUpdateDefinition(definitionId));
  ipcMain.handle("settings:get", async () => localState.readSettings());
  ipcMain.handle("settings:save", async (_, patch) => localState.writeSettings(patch));

  ipcMain.handle("codex:getAccount", async () => ensureCodexReady());
  ipcMain.handle("codex:login", async () => loginWithCodex());
  ipcMain.handle("codex:launchJob", async (_, jobId) => launchJob(jobId));
  ipcMain.handle("codex:getSession", async (_, jobId) => clone(getOrCreateSession(jobId)));
  ipcMain.handle("codex:getServerLog", async () => codexClient.getLog());
  ipcMain.handle("codex:respondToApproval", async (_, payload) => respondToServerRequest(payload.requestId, payload.decision));

  createWindow();

  ensureCodexReady().catch(() => {
    // The UI can surface install/login issues when it requests account state.
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  codexClient.stop();
});
