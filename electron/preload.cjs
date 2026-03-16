const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getBackendUrl: () => ipcRenderer.invoke("desktop:getBackendUrl"),
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
  focusTerminal: () => ipcRenderer.invoke("desktop:focusTerminal"),
});
