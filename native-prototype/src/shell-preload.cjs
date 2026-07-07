const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("selfmatrixNative", {
  getStatus: () => ipcRenderer.invoke("native:get-status"),
  ensureCallView: () => ipcRenderer.invoke("native:ensure-call-view"),
  detachCallView: () => ipcRenderer.invoke("native:detach-call-view"),
  attachCallView: () => ipcRenderer.invoke("native:attach-call-view"),
  sendWidgetAction: (action, data) => ipcRenderer.invoke("native:send-widget-action", { action, data }),
  onWidgetMessage: (callback) => {
    ipcRenderer.on("native:widget-message", (_event, message) => callback(message));
  },
});
