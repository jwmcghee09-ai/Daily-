'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, session, net } = require('electron');
const path = require('path');
const https = require('https');
const fs   = require('fs');

// ─── Config ──────────────────────────────────────────────────────────────────
const PROD_URL       = 'https://spectre-assets.com';
const APP_URL        = process.env.SPECTRE_DEV_URL || (PROD_URL + '/dashboard');
const ANALYTICS_URL  = PROD_URL + '/spectre-desktop-analytics.html';
const ANALYTICS_FILE = path.join(__dirname, 'analytics.html');
const IS_MAC         = process.platform === 'darwin';

// ─── Window state persistence ─────────────────────────────────────────────────
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const { screen } = require('electron');
    const area = screen.getDisplayMatching(s).workArea;
    if (s.x >= area.x && s.y >= area.y &&
        s.x + s.width  <= area.x + area.width &&
        s.y + s.height <= area.y + area.height) {
      return s;
    }
  } catch { /* first launch */ }
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
function saveZoom(f) {
  try { fs.writeFileSync(ZOOM_FILE, JSON.stringify({ factor: f })); } catch { /* non-fatal */ }
}

// ─── Server wake-up ping ──────────────────────────────────────────────────────
function pingServer() {
  try {
    const u = new URL(PROD_URL);
    https.get({ hostname: u.hostname, path: '/api/health', timeout: 30000 }, () => {}).on('error', () => {});
  } catch { /* non-fatal */ }
}

// ─── Desktop CSS ──────────────────────────────────────────────────────────────
const DESKTOP_CSS = `
  ::-webkit-scrollbar        { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track  { background: transparent; }
  ::-webkit-scrollbar-thumb  { background: rgba(124,77,255,.32); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(124,77,255,.52); }
  footer { display: none !important; }
` + (IS_MAC ? `
  /* Clear macOS traffic lights from nav content */
  .nav-inner { padding-left: 82px !important; }
` : '');

// ─── Analytics tab injection ──────────────────────────────────────────────────
// Appends an ANALYTICS tab to the existing nav on every non-analytics page.
const ANALYTICS_TAB_JS = `
(function () {
  if (document.getElementById('__sp-at')) return;
  if (location.href.includes('spectre-desktop-analytics')) return;
  var tabs = document.querySelector('.nav-tabs');
  if (!tabs) return;
  var a = document.createElement('a');
  a.id        = '__sp-at';
  a.href      = '${ANALYTICS_URL}';
  a.className = 'nav-tab';
  a.textContent = 'ANALYTICS';
  a.style.cssText = 'text-decoration:none;cursor:pointer;';
  tabs.appendChild(a);
})();
`;

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  const state = loadWindowState();

  const win = new BrowserWindow({
    ...state,
    minWidth:  960,
    minHeight: 620,
    title: 'SPECTRE',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    trafficLightPosition: IS_MAC ? { x: 18, y: 20 } : undefined,
    autoHideMenuBar: !IS_MAC,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:spectre',
    },
    backgroundColor: '#ddd6f3',
    show: false,
  });

  if (state.maximized) win.maximize();

  win.loadURL(APP_URL);
  win.once('ready-to-show', () => win.show());

  // ── Progress bar ──────────────────────────────────────────────────────────────
  win.webContents.on('did-start-loading', () => win.setProgressBar(2));
  win.webContents.on('did-stop-loading',  () => win.setProgressBar(-1));

  // ── Inject desktop chrome ─────────────────────────────────────────────────────
  const savedZoom = loadZoom();
  win.webContents.on('did-finish-load', () => {
    if (savedZoom !== 1) win.webContents.setZoomFactor(savedZoom);
    const url = win.webContents.getURL();
    if (url.startsWith(PROD_URL)) {
      win.webContents.insertCSS(DESKTOP_CSS).catch(() => {});
      win.webContents.executeJavaScript(ANALYTICS_TAB_JS).catch(() => {});
    }
  });

  win.webContents.on('zoom-changed', (_, dir) => {
    const next = Math.min(Math.max(
      win.webContents.getZoomFactor() + (dir === 'in' ? 0.1 : -0.1), 0.5), 3.0);
    win.webContents.setZoomFactor(next);
    saveZoom(next);
  });

  // ── Error page ────────────────────────────────────────────────────────────────
  win.webContents.on('did-fail-load', (_, code) => {
    if (code === -3) return;
    win.loadFile(path.join(__dirname, 'error.html'));
  });

  // ── External links ────────────────────────────────────────────────────────────
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(PROD_URL) || url.startsWith('about:')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    // Block marketing root — send to dashboard instead
    if (url === PROD_URL || url === PROD_URL + '/') {
      event.preventDefault();
      win.loadURL(APP_URL);
      return;
    }
    const isApp    = url.startsWith(PROD_URL) || url.startsWith('http://localhost');
    const isStripe = url.startsWith('https://billing.stripe.com') ||
                     url.startsWith('https://checkout.stripe.com');
    if (!isApp && !isStripe) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // ── Window state ──────────────────────────────────────────────────────────────
  win.on('close', () => saveWindowState(win));
  ['resize', 'move'].forEach(e => win.on(e, () => saveWindowState(win)));

  return win;
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.on('retry', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.loadURL(APP_URL);
});
ipcMain.handle('get-version', () => app.getVersion());

// ─── Menu ─────────────────────────────────────────────────────────────────────
function buildMenu(win) {
  const go = (url) => () => win.loadURL(url);
  const template = [
    ...(IS_MAC ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open in Browser',
          accelerator: IS_MAC ? 'Cmd+Shift+B' : 'Ctrl+Shift+B',
          click: () => shell.openExternal(PROD_URL + '/dashboard'),
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
    {
      label: 'Go',
      submenu: [
        { label: 'Dashboard',  accelerator: IS_MAC ? 'Cmd+1' : 'Ctrl+1', click: go(APP_URL) },
        { label: 'Analytics',  accelerator: IS_MAC ? 'Cmd+2' : 'Ctrl+2', click: go(ANALYTICS_URL) },
        { label: 'Research',   accelerator: IS_MAC ? 'Cmd+3' : 'Ctrl+3', click: go(PROD_URL + '/research') },
        { label: 'Settings',   accelerator: IS_MAC ? 'Cmd+4' : 'Ctrl+4', click: go(PROD_URL + '/settings') },
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

  // Serve the bundled analytics page under the production origin so that
  // session cookies work and relative API paths resolve correctly.
  const ses = session.fromPartition('persist:spectre');
  ses.protocol.handle('https', async (request) => {
    try {
      const u = new URL(request.url);
      if (u.host === 'spectre-assets.com' && u.pathname === '/spectre-desktop-analytics.html') {
        return net.fetch('file://' + ANALYTICS_FILE);
      }
    } catch { /* malformed URL — fall through */ }
    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  });

  const win = createWindow();
  buildMenu(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      buildMenu(createWindow());
    }
  });
});

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});
