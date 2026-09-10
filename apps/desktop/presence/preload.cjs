const { contextBridge, ipcRenderer } = require("electron");
const allowed = new Set([
    "hide",
    "home",
    "expand",
    "drag-start",
    "drag-move",
    "drag-end",
    "click-through",
    "size",
    "microphone",
    "metrics",
]);
contextBridge.exposeInMainWorld("jarvisPresence", {
    command: (name, value) =>
        allowed.has(name)
            ? ipcRenderer.invoke("presence:command", name, value)
            : Promise.reject(new Error("Unsupported command")),
    subscribe: (callback) => {
        const channels = [
            "runtime-state",
            "expanded",
            "suspend",
            "notice",
            "collapse-request",
            "expand-request",
        ];
        const listeners = channels.map((channel) => {
            const listener = (_event, value) => callback(channel, value);
            ipcRenderer.on(channel, listener);
            return [channel, listener];
        });
        return () =>
            listeners.forEach(([channel, listener]) =>
                ipcRenderer.removeListener(channel, listener),
            );
    },
});
