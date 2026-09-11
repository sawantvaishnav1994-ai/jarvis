import { performance } from "node:perf_hooks";
import {
    app,
    BrowserWindow,
    ipcMain,
    screen,
    globalShortcut,
    Menu,
    Tray,
    nativeImage,
    shell,
    systemPreferences,
    dialog,
} from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PresenceController, clampPosition, normalizePoint } from "./state.mjs";
const root = dirname(fileURLToPath(import.meta.url));
const entry = pathToFileURL(join(root, "index.html")).href;
const controller = new PresenceController();
let win,
    tray,
    quitting = false,
    expanded = false,
    size = 140,
    saveTimer;
let config = {},
    drag = null,
    microphoneAllowed = false;
let microphoneRequest = 0;
const started = performance.now();
let startupMs = 0;
const home = new URL(process.env.JARVIS_HOME_URL || "http://localhost:3000");
if (
    !(
        home.protocol === "https:" ||
        (home.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(home.hostname))
    ) ||
    home.username ||
    home.password
)
    throw new Error("Invalid JARVIS_HOME_URL");
const configPath = () => join(app.getPath("userData"), "presence.json");
const send = (type, value) => {
    if (win && !win.isDestroyed()) win.webContents.send(type, value);
};
function position(point) {
    point = normalizePoint(point);
    const area = screen.getDisplayNearestPoint(
        point || screen.getCursorScreenPoint(),
    ).workArea;
    return clampPosition(point, area, expanded ? 280 : size);
}
function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            await mkdir(app.getPath("userData"), { recursive: true });
            await writeFile(configPath(), JSON.stringify(config), {
                mode: 0o600,
            });
        } catch {
            send("notice", "Position could not be saved.");
        }
    }, 250);
}
function collapse() {
    expanded = false;
    win.setBounds({ ...position(config.position), width: size, height: size });
    send("expanded", false);
}
function show() {
    win.setIgnoreMouseEvents(false);
    win.showInactive();
}
function hide() {
    microphoneRequest++;
    microphoneAllowed = false;
    send("suspend");
    collapse();
    win.hide();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on("second-instance", show);
    app.on("before-quit", () => {
        quitting = true;
    });
    await app.whenReady();
    try {
        config = JSON.parse(await readFile(configPath(), "utf8"));
    } catch {
        config = {};
    }
    if (!config || typeof config !== "object") config = {};
    size = [100, 120, 140].includes(config.size) ? config.size : 140;
    win = new BrowserWindow({
        ...position(config.position),
        width: size,
        height: size,
        transparent: true,
        frame: false,
        hasShadow: false,
        alwaysOnTop: true,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        show: false,
        backgroundColor: "#00000000",
        webPreferences: {
            preload: join(root, "preload.cjs"),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
            backgroundThrottling: true,
        },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.webContents.session.setPermissionCheckHandler(
        (contents, permission, _origin, details) =>
            contents === win.webContents &&
            permission === "media" &&
            microphoneAllowed &&
            details.mediaType === "audio",
    );
    win.webContents.session.setPermissionRequestHandler(
        (contents, permission, callback, details) =>
            callback(
                contents === win.webContents &&
                    permission === "media" &&
                    microphoneAllowed &&
                    details.mediaTypes?.length === 1 &&
                    details.mediaTypes[0] === "audio",
            ),
    );
    win.on("close", (e) => {
        if (!quitting) {
            e.preventDefault();
            hide();
        }
    });
    win.on("blur", () => {
        if (expanded) send("collapse-request");
    });
    const displayChanged = () => {
        config.position = position(config.position);
        collapse();
        save();
    };
    screen.on("display-removed", displayChanged);
    screen.on("display-metrics-changed", displayChanged);
    const icon = nativeImage.createFromDataURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAG0lEQVQ4T2NkYPj/n4ECwESJ5lEDRg0YNWAwGQAAgwEBHke9WQAAAABJRU5ErkJggg==",
    );
    tray = new Tray(icon);
    tray.setToolTip("JARVIS Presence");
    tray.setContextMenu(
        Menu.buildFromTemplate([
            { label: "Show / restore mouse interaction", click: show },
            { label: "Hide presence", click: hide },
            {
                label: "Open JARVIS Home",
                click: () => shell.openExternal(home.href),
            },
            { label: "Quit presence only", click: () => app.quit() },
        ]),
    );
    tray.on("click", show);
    if (
        !globalShortcut.register("CommandOrControl+Shift+J", () => {
            show();
            win.focus();
            send("expand-request");
        })
    )
        send("notice", "Shortcut unavailable. Use the tray to show JARVIS.");
    app.on("will-quit", () => globalShortcut.unregisterAll());
    ipcMain.handle("presence:command", async (event, command, value) => {
        if (
            event.sender !== win.webContents ||
            event.senderFrame !== win.webContents.mainFrame ||
            event.senderFrame.url !== entry
        )
            throw new Error("Invalid sender");
        switch (command) {
            case "hide":
                hide();
                return;
            case "home":
                return shell.openExternal(home.href);
            case "expand":
                expanded = value === true;
                win.setBounds({
                    ...position(config.position),
                    width: expanded ? 280 : size,
                    height: expanded ? 280 : size,
                });
                send("expanded", expanded);
                return;
            case "drag-start":
                drag = {
                    cursor: screen.getCursorScreenPoint(),
                    bounds: win.getBounds(),
                };
                return;
            case "drag-move":
                if (drag) {
                    const p = screen.getCursorScreenPoint();
                    const next = position({
                        x: drag.bounds.x + p.x - drag.cursor.x,
                        y: drag.bounds.y + p.y - drag.cursor.y,
                    });
                    win.setPosition(next.x, next.y);
                }
                return;
            case "drag-end":
                if (drag) {
                    const b = win.getBounds();
                    config.position = { x: b.x, y: b.y };
                    drag = null;
                    save();
                }
                return;
            case "click-through":
                win.setIgnoreMouseEvents(value === true);
                return;
            case "size":
                if ([100, 120, 140].includes(value)) {
                    size = value;
                    config.size = size;
                    collapse();
                    save();
                }
                return;
            case "microphone": {
                const requestId = ++microphoneRequest;
                microphoneAllowed = false;
                if (value !== true) return false;
                const consent = await dialog.showMessageBox(win, {
                    type: "question",
                    buttons: ["Cancel", "Enable microphone"],
                    defaultId: 0,
                    cancelId: 0,
                    message: "Enable local microphone visualization?",
                    detail: "Audio is analyzed for amplitude only. No recording, upload or transcription. The voice runtime is not connected.",
                });
                if (
                    consent.response !== 1 ||
                    requestId !== microphoneRequest ||
                    !win.isVisible()
                )
                    return false;
                const osAllowed =
                    process.platform !== "darwin" ||
                    (await systemPreferences.askForMediaAccess("microphone"));
                microphoneAllowed =
                    osAllowed &&
                    requestId === microphoneRequest &&
                    win.isVisible();
                return microphoneAllowed;
            }
            case "metrics":
                return {
                    startupMs,
                    processes: app.getAppMetrics().map((p) => ({
                        type: p.type,
                        cpu: p.cpu,
                        memory: p.memory,
                    })),
                    graphics: app.getGPUFeatureStatus(),
                };
            default:
                throw new Error("Unsupported command");
        }
    });
    // Private inherited IPC only: a trusted composition root may supply presentation
    // events. There is no network listener, arbitrary tool invocation or credential IPC.
    process.on("message", (value) => {
        controller.accept(value);
    });
    const heartbeat = setInterval(
        () => send("runtime-state", controller.snapshot()),
        250,
    );
    app.on("will-quit", () => clearInterval(heartbeat));
    await win.loadFile(join(root, "index.html"));
    startupMs = performance.now() - started;
    show();
}
