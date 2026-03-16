const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  pickPaths: (options) => ipcRenderer.invoke("dialog:pickPaths", options),
  openPath: (targetPath) => ipcRenderer.invoke("desktop:openPath", targetPath),
  getBackendLog: () => ipcRenderer.invoke("desktop:getBackendLog"),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || "";
    } catch {
      return "";
    }
  },
  appState: () => ipcRenderer.invoke("state:get"),
  createProject: (payload) => ipcRenderer.invoke("project:create", payload),
  createJob: (payload) => ipcRenderer.invoke("job:create", payload),
  listJobOutputs: (jobId) => ipcRenderer.invoke("job:listOutputs", jobId),
  appendJobQa: (jobId, content) => ipcRenderer.invoke("job:appendQa", { jobId, content }),
  createUpdateDefinition: (payload) => ipcRenderer.invoke("updateDefinition:create", payload),
  runUpdateDefinition: (definitionId) => ipcRenderer.invoke("updateDefinition:run", definitionId),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (patch) => ipcRenderer.invoke("settings:save", patch),
  focusTerminal: () => ipcRenderer.invoke("desktop:focusTerminal"),
  codex: {
    getAccount: () => ipcRenderer.invoke("codex:getAccount"),
    login: () => ipcRenderer.invoke("codex:login"),
    launchJob: (jobId) => ipcRenderer.invoke("codex:launchJob", jobId),
    getSession: (jobId) => ipcRenderer.invoke("codex:getSession", jobId),
    getServerLog: () => ipcRenderer.invoke("codex:getServerLog"),
    respondToApproval: (requestId, decision) =>
      ipcRenderer.invoke("codex:respondToApproval", { requestId, decision }),
    subscribe: (listener) => {
      const handler = (_, payload) => listener(payload);
      ipcRenderer.on("codex:event", handler);
      return () => ipcRenderer.removeListener("codex:event", handler);
    },
  },
});
