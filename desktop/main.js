const path = require("path");
const fs = require("fs");

const { app, BrowserWindow, shell } = require("electron");

// GPU process segfaults on Wayland + NVIDIA (Electron 33.x).
// Disable the GPU process via command-line switches before app.whenReady().
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-sandbox");

const PORT = process.env.EXCALIDRAW_PORT || 7311;
const URL = `http://localhost:${PORT}`;
const LOG_FILE = path.join(app.getPath("userData"), "debug.log");

/**
 * Append a timestamped line to the debug log (kept in the user data dir).
 */
function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* silently drop — logging must never break the app */
  }
  // eslint-disable-next-line no-console -- Electron writes this to the app log
  console.log(line.trim());
}

/**
 * Create the main window. The app stays alive independently of any single window.
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: "Excalidraw",
    icon: path.join(__dirname, "icon.png"),
  });

  log(`Loading Excalidraw at ${URL}`);

  win
    .loadURL(URL)
    .then(() => log("Page loaded successfully"))
    .catch((err) => log(`Failed to load page: ${err.message}`));

  // Keep the app alive — closing the window does NOT quit Electron.
  // Reopen it from the desktop entry, or stop it with ./stop.sh.
  win.on("closed", () => {
    log("Window closed — app stays alive");
  });

  // Intercept all links — open them in the system browser instead of
  // navigating away from the Excalidraw canvas.
  win.webContents.setWindowOpenHandler(({ url }) => {
    log(`Link opened — launching system browser: ${url}`);
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (url !== URL && !url.includes(`localhost:${PORT}`)) {
      log(`Navigation intercepted: ${url} → opening in system browser`);
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.on("ready-to-show", () => log("Window ready to show"));
}

// Keep the app alive even when no windows are open.
app.on("activate", () => {
  log("Activate event — creating new window");
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    createWindow();
  } else if (!win.isVisible()) {
    win.show();
  } else {
    win.focus();
  }
});

app.whenReady().then(createWindow);

// Don't quit on Ctrl+Q or window-all-closed — let the user manage the app lifecycle.
app.on("window-all-closed", () => log("All windows closed — staying alive"));

app.on("quit", () => log("Quit requested"));

process.on("uncaughtException", (err) =>
  log(`UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`),
);

process.on("unhandledRejection", (reason, promise) =>
  log(`UNHANDLED REJECTION at ${promise}: ${reason}`),
);
