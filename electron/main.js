'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const fs   = require('fs');

// ─── Config ──────────────────────────────────────────────────────────────────
const PROD_URL = 'https://spectre-assets.com';
const APP_URL  = process.env.SPECTRE_DEV_URL || (PROD_URL + '/dashboard');
const IS_MAC   = process.platform === 'darwin';

// ─── Window state persistence ─────────────────────────────────────────────────
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    // Validate the saved bounds are still on a visible screen
    const { screen } = require('electron');
    const area = screen.getDisplayMatching(s).workArea;
    if (s.x >= area.x && s.y >= area.y &&
        s.x + s.width  <= area.x + area.width &&
        s.y + s.height <= area.y + area.height) {
      return s;
    }
  } catch { /* first launch or corrupt file */ }
  return { width: 1400, height: 900 };
}

function saveWindowState(win) {
  if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(win.getBounds())); } catch { /* non-fatal */ }
}

// ─── Zoom persistence ─────────────────────────────────────────────────────────
const ZOOM_FILE = path.join(app.getPath('userData'), 'zoom.json');

function loadZoom() {
  try { return JSON.parse(fs.readFileSync(ZOOM_FILE, 'utf8')).factor ?? 1; } catch { return 1; }
}

function saveZoom(factor) {
  try { fs.writeFileSync(ZOOM_FILE, JSON.stringify({ factor })); } catch { /* non-fatal */ }
}

// ─── Server wake-up ping ──────────────────────────────────────────────────────
// Render instances spin down after inactivity. Pinging on launch gives the
// server a head start while the user sees the splash screen.
function pingServer() {
  try {
    const u = new URL(PROD_URL);
    https.get({ hostname: u.hostname, path: '/api/health', timeout: 30000 }, () => {}).on('error', () => {});
  } catch { /* non-fatal */ }
}

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  const state = loadWindowState();

  const win = new BrowserWindow({
    ...state,
    minWidth:  960,
    minHeight: 620,
    title: 'SPECTRE',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    trafficLightPosition: IS_MAC ? { x: 16, y: 18 } : undefined,
    autoHideMenuBar: !IS_MAC,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:spectre',
    },
    // Lavender bg fills any gap between splash and app load — no white flash
    backgroundColor: '#e9e4f6',
    show: true,
  });

  if (state.maximized) win.maximize();

  // ── Splash → App ────────────────────────────────────────────────────────────
  let loadingApp = false;

  win.loadFile(path.join(__dirname, 'loading.html'));

  win.webContents.once('did-finish-load', () => {
    loadingApp = true;
    win.loadURL(APP_URL);
  });

  // ── Progress bar (dock on Mac, taskbar on Windows) ───────────────────────────
  win.webContents.on('did-start-loading', () => {
    if (loadingApp) win.setProgressBar(2); // 2 = indeterminate
  });
  win.webContents.on('did-stop-loading', () => {
    win.setProgressBar(-1); // hide
  });

  // ── Zoom persistence ─────────────────────────────────────────────────────────
  const savedZoom = loadZoom();
  win.webContents.on('did-finish-load', () => {
    if (loadingApp) {
      win.webContents.setZoomFactor(savedZoom);
    }
  });
  win.webContents.on('zoom-changed', (_, direction) => {
    const current = win.webContents.getZoomFactor();
    const next = direction === 'in'
      ? Math.min(current + 0.1, 3.0)
      : Math.max(current - 0.1, 0.5);
    win.webContents.setZoomFactor(next);
    saveZoom(next);
  });

  // ── Error page ───────────────────────────────────────────────────────────────
  win.webContents.on('did-fail-load', (_, errorCode, __, url) => {
    // -3 = ERR_ABORTED (user navigated away), ignore
    if (errorCode === -3 || !loadingApp) return;
    win.loadFile(path.join(__dirname, 'error.html'));
  });

  // ── External links ───────────────────────────────────────────────────────────
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL) || url.startsWith(PROD_URL) || url.startsWith('about:')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const isApp    = url.startsWith(PROD_URL) || url.startsWith('http://localhost');
    const isStripe = url.startsWith('https://billing.stripe.com') || url.startsWith('https://checkout.stripe.com');
    if (!isApp && !isStripe) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // ── Window state save ────────────────────────────────────────────────────────
  win.on('close', () => saveWindowState(win));
  ['resize', 'move'].forEach(e => win.on(e, () => saveWindowState(win)));

  return win;
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
// Called by error.html retry button
ipcMain.on('retry', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.loadURL(APP_URL);
});

ipcMain.handle('get-version', () => app.getVersion());

// ─── Menu ─────────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    ...(IS_MAC ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open in Browser',
          accelerator: IS_MAC ? 'Cmd+Shift+B' : 'Ctrl+Shift+B',
          click: () => shell.openExternal(PROD_URL),
        },
        { type: 'separator' },
        IS_MAC ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(!app.isPackaged ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Open spectre-assets.com', click: () => shell.openExternal(PROD_URL) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  pingServer();
  createWindow();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});
