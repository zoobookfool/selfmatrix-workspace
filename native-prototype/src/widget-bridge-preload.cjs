const { ipcRenderer } = require("electron");

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object" || !data.api || !data.requestId || !data.widgetId) {
    return;
  }

  ipcRenderer.send("widget-api-message", {
    data,
    origin: event.origin,
    sourceIsSelf: event.source === window,
  });
});

ipcRenderer.on("widget-api-response", (_event, response) => {
  window.postMessage(response, "*");
});

ipcRenderer.on("widget-api-to-widget", (_event, request) => {
  window.postMessage(request, "*");
});
