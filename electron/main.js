'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, session, net, nativeTheme } = require('electron');
const path = require('path');
const https = require('https');
const fs   = require('fs');

// ─── Config ──────────────────────────────────────────────────────────────────
const PROD_URL       = 'https://spectre-assets.com';
const ANALYTICS_URL  = PROD_URL + '/spectre-desktop-analytics.html';
const WELCOME_URL    = PROD_URL + '/welcome';
const ANALYTICS_FILE = path.join(__dirname, 'analytics.html');
const WELCOME_FILE   = path.join(__dirname, 'welcome.html');
const IS_MAC         = process.platform === 'darwin';

// ─── Persistence helpers ──────────────────────────────────────────────────────
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const ZOOM_FILE  = path.join(app.getPath('userData'), 'zoom.json');
const THEME_FILE = path.join(app.getPath('userData'), 'theme.json');

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const { screen } = require('electron');
    const area = screen.getDisplayMatching(s).workArea;
    if (s.x >= area.x && s.y >= area.y &&
        s.x + s.width  <= area.x + area.width &&
        s.y + s.height <= area.y + area.height) return s;
  } catch {}
  return { width: 1400, height: 900 };
}
function saveWindowState(win) {
  if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(win.getBounds())); } catch {}
}

function loadZoom()  { try { return JSON.parse(fs.readFileSync(ZOOM_FILE,'utf8')).factor ?? 1; } catch { return 1; } }
function saveZoom(f) { try { fs.writeFileSync(ZOOM_FILE, JSON.stringify({ factor: f })); } catch {} }

function loadTheme()  { try { return JSON.parse(fs.readFileSync(THEME_FILE,'utf8')).theme || null; } catch { return null; } }
function saveTheme(t) { try { fs.writeFileSync(THEME_FILE, JSON.stringify({ theme: t })); } catch {} }

// First launch = no theme saved yet
const storedTheme = loadTheme();
if (storedTheme) nativeTheme.themeSource = storedTheme;
const APP_URL = process.env.SPECTRE_DEV_URL
  || (storedTheme === null ? WELCOME_URL : PROD_URL + '/dashboard');

// ─── Server wake-up ping ──────────────────────────────────────────────────────
function pingServer() {
  try {
    const u = new URL(PROD_URL);
    https.get({ hostname: u.hostname, path: '/api/health', timeout: 30000 }, () => {}).on('error', () => {});
  } catch {}
}

// ─── Desktop CSS ──────────────────────────────────────────────────────────────
const DESKTOP_CSS = `
  ::-webkit-scrollbar        { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track  { background: transparent; }
  ::-webkit-scrollbar-thumb  { background: rgba(124,77,255,.32); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(124,77,255,.52); }
  footer { display: none !important; }
` + (IS_MAC ? `  .nav-inner { padding-left: 82px !important; }` : '');

// ─── Dark web-app CSS override ────────────────────────────────────────────────
// Injected into every spectre-assets.com page. The DARK_THEME_JS snippet
// toggles class "electron-dark" on <html> so we can switch without a reload.
const DARK_WEB_CSS = `
html.electron-dark { color-scheme: dark; }
html.electron-dark body { background: #07050f !important; color: #e4dcff !important; }
html.electron-dark :root {
  --bg: #07050f !important;
  --card: #0d0a1a !important;
  --card2: #0f0b1f !important;
  --surface3: rgba(124,77,255,.08) !important;
  --border: rgba(124,77,255,.15) !important;
  --border2: rgba(124,77,255,.25) !important;
  --text: #e4dcff !important;
  --muted: #9890b8 !important;
  --muted2: #7a7299 !important;
  --shadow: 0 1px 3px rgba(0,0,0,.4),0 6px 20px rgba(124,77,255,.15) !important;
  --sl-bg: #07050f !important;
  --sl-page-text: #e4dcff !important;
  --sl-page-muted: #9890b8 !important;
}
/* catch-all: any element that still has #0f0d1e hardcoded gets flipped light */
html.electron-dark h1, html.electron-dark h2, html.electron-dark h3,
html.electron-dark h4, html.electron-dark h5, html.electron-dark h6,
html.electron-dark p, html.electron-dark span, html.electron-dark label,
html.electron-dark td, html.electron-dark th, html.electron-dark li,
html.electron-dark div:not([class*="gradient"]) { color: inherit; }
html.electron-dark nav,
html.electron-dark .nav-wrap { background: rgba(7,5,15,.96) !important; border-bottom-color: rgba(124,77,255,.15) !important; }
html.electron-dark .nav-tab { color: #9890b8 !important; }
html.electron-dark .nav-tab-active { color: #d4c0f0 !important; }
html.electron-dark .nav-ticker { background: rgba(5,3,12,.97) !important; border-bottom-color: rgba(124,77,255,.1) !important; }
html.electron-dark .nav-ticker-price,
html.electron-dark .nav-ticker-name { color: #e4dcff !important; }
html.electron-dark .nav-btn,
html.electron-dark .nav-settings-btn,
html.electron-dark .btn-ghost { color: #d4c0f0 !important; border-color: rgba(124,77,255,.3) !important; }
html.electron-dark .nav-btn:hover,
html.electron-dark .nav-settings-btn:hover { background: rgba(124,77,255,.1) !important; color: #e4dcff !important; }
html.electron-dark .kpi-card,
html.electron-dark .panel-half,
html.electron-dark .meta-panel,
html.electron-dark .upload-card,
html.electron-dark .risk-bar-wrap,
html.electron-dark .kpi-mini,
html.electron-dark .perf-row,
html.electron-dark .stress-card,
html.electron-dark .card,
html.electron-dark .modal,
html.electron-dark [class*="-card"]:not([class*="gradient"]) { background: #0d0a1a !important; border-color: rgba(124,77,255,.18) !important; }
html.electron-dark .kpi-val,
html.electron-dark .kpi-mini-val,
html.electron-dark .panel-half-title,
html.electron-dark .sec-title,
html.electron-dark .upload-title,
html.electron-dark .kpi-lbl-val,
html.electron-dark [class*="-title"],
html.electron-dark [class*="-val"] { color: #e4dcff !important; }
html.electron-dark .kpi-lbl,
html.electron-dark .kpi-mini-lbl,
html.electron-dark [class*="-lbl"],
html.electron-dark [class*="-sub"],
html.electron-dark [class*="-muted"],
html.electron-dark [class*="-meta"] { color: #9890b8 !important; }
html.electron-dark input, html.electron-dark select, html.electron-dark textarea {
  background: #0d0a1a !important; color: #e4dcff !important;
  border-color: rgba(124,77,255,.3) !important;
}
html.electron-dark table { background: transparent !important; }
html.electron-dark thead th { background: rgba(124,77,255,.08) !important; color: #9890b8 !important; }
html.electron-dark tbody tr:hover td { background: rgba(124,77,255,.07) !important; }
html.electron-dark tbody td { color: #e4dcff !important; border-color: rgba(124,77,255,.08) !important; }
`;

const DARK_THEME_JS = `
(function() {
  function applyTheme(t) { document.documentElement.classList.toggle('electron-dark', t === 'dark'); }
  if (window.electronAPI) {
    window.electronAPI.getTheme().then(applyTheme).catch(function(){});
    window.electronAPI.onThemeChange(applyTheme);
  }
})();
`;

// ─── Analytics tab injection ──────────────────────────────────────────────────
const ANALYTICS_TAB_JS = `
(function () {
  if (location.href.includes('spectre-desktop-analytics') || location.href.includes('/welcome')) return;
  function inject() {
    if (document.getElementById('__sp-at')) return true;
    // Find the RESEARCH nav item by text — works regardless of CSS class names
    var all = Array.from(document.querySelectorAll('a, span, button'));
    var research = all.find(function(el) {
      var t = el.textContent.trim().toUpperCase();
      return t === 'RESEARCH' && el.offsetParent !== null;
    });
    if (!research) return false;
    var a = document.createElement('a');
    a.id = '__sp-at';
    a.href = '${ANALYTICS_URL}';
    a.className = research.className;
    a.classList.remove('nav-tab-active', 'active', 'selected', 'current');
    a.textContent = 'Analytics';
    a.style.cssText = 'text-decoration:none;cursor:pointer;border-bottom-color:transparent!important;';
    research.parentNode.insertBefore(a, research.nextSibling);
    return true;
  }
  if (inject()) return;
  var n = 0, t = setInterval(function() { if (inject() || ++n > 20) clearInterval(t); }, 250);
})();`;

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  const state = loadWindowState();
  const win = new BrowserWindow({
    ...state,
    minWidth: 960, minHeight: 620,
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
    backgroundColor: (loadTheme() === 'dark') ? '#07050f' : '#ddd6f3',
    show: false,
  });

  if (state.maximized) win.maximize();
  win.loadURL(APP_URL);
  win.once('ready-to-show', () => win.show());

  win.webContents.on('did-start-loading', () => win.setProgressBar(2));
  win.webContents.on('did-stop-loading',  () => win.setProgressBar(-1));

  const savedZoom = loadZoom();
  win.webContents.on('did-finish-load', () => {
    if (savedZoom !== 1) win.webContents.setZoomFactor(savedZoom);
    const url = win.webContents.getURL();
    const isWebApp = url.startsWith(PROD_URL)
      && !url.includes('/welcome')
      && !url.includes('spectre-desktop-analytics');
    if (isWebApp) {
      const theme = loadTheme() || 'dark';
      win.webContents.insertCSS(DESKTOP_CSS).catch(() => {});
      win.webContents.insertCSS(DARK_WEB_CSS).catch(() => {});
      // Apply dark class synchronously (no async IPC) to prevent white flash
      win.webContents.executeJavaScript(
        `document.documentElement.classList.toggle('electron-dark', ${theme === 'dark'});` +
        `(function(){if(window.electronAPI)window.electronAPI.onThemeChange(function(t){document.documentElement.classList.toggle('electron-dark',t==='dark');});})();`
      ).catch(() => {});
      win.webContents.executeJavaScript(ANALYTICS_TAB_JS).catch(() => {});
    }
  });

  win.webContents.on('zoom-changed', (_, dir) => {
    const next = Math.min(Math.max(win.webContents.getZoomFactor() + (dir==='in'?0.1:-0.1), 0.5), 3.0);
    win.webContents.setZoomFactor(next); saveZoom(next);
  });

  win.webContents.on('did-fail-load', (_, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    win.loadFile(path.join(__dirname, 'error.html'));
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(PROD_URL) || url.startsWith('about:')) return { action: 'allow' };
    shell.openExternal(url); return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url === PROD_URL || url === PROD_URL + '/') {
      event.preventDefault(); win.loadURL(PROD_URL + '/dashboard'); return;
    }
    const isApp    = url.startsWith(PROD_URL) || url.startsWith('http://localhost');
    const isStripe = url.startsWith('https://billing.stripe.com') || url.startsWith('https://checkout.stripe.com');
    if (!isApp && !isStripe) { event.preventDefault(); shell.openExternal(url); }
  });

  win.on('close', () => saveWindowState(win));
  ['resize','move'].forEach(e => win.on(e, () => saveWindowState(win)));
  return win;
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.on('retry', () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.loadURL(APP_URL); });
ipcMain.handle('get-version', () => app.getVersion());
ipcMain.handle('get-theme',   () => loadTheme() || 'dark');
ipcMain.handle('set-theme',   (_, t) => {
  saveTheme(t); nativeTheme.themeSource = t;
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('theme-changed', t));
  return t;
});

// ─── Menu ─────────────────────────────────────────────────────────────────────
function buildMenu(win) {
  const go = (url) => () => win.loadURL(url);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(IS_MAC ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Open in Browser', accelerator: IS_MAC?'Cmd+Shift+B':'Ctrl+Shift+B', click: () => shell.openExternal(PROD_URL+'/dashboard') },
      { type: 'separator' },
      IS_MAC ? { role: 'close' } : { role: 'quit' },
    ]},
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { role:'reload' }, { role:'forceReload' }, { type:'separator' },
      { role:'resetZoom' }, { role:'zoomIn' }, { role:'zoomOut' },
      { type:'separator' }, { role:'togglefullscreen' },
      ...(!app.isPackaged ? [{ type:'separator' }, { role:'toggleDevTools' }] : []),
    ]},
    { label: 'Go', submenu: [
      { label: 'Dashboard',  accelerator: IS_MAC?'Cmd+1':'Ctrl+1', click: go(PROD_URL+'/dashboard') },
      { label: 'Analytics',  accelerator: IS_MAC?'Cmd+2':'Ctrl+2', click: go(ANALYTICS_URL) },
      { label: 'Research',   accelerator: IS_MAC?'Cmd+3':'Ctrl+3', click: go(PROD_URL+'/research') },
      { label: 'Settings',   accelerator: IS_MAC?'Cmd+4':'Ctrl+4', click: go(PROD_URL+'/settings') },
    ]},
    { label: 'Appearance', submenu: [
      { label: 'Light Mode', click: () => { saveTheme('light'); nativeTheme.themeSource = 'light'; win.webContents.send('theme-changed', 'light'); } },
      { label: 'Dark Mode',  click: () => { saveTheme('dark');  nativeTheme.themeSource = 'dark';  win.webContents.send('theme-changed', 'dark');  } },
    ]},
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label:'Open spectre-assets.com', click:()=>shell.openExternal(PROD_URL) }] },
  ]));
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  pingServer();

  const ses = session.fromPartition('persist:spectre');
  ses.protocol.handle('https', async (request) => {
    try {
      const u = new URL(request.url);
      if (u.host === 'spectre-assets.com') {
        if (u.pathname === '/spectre-desktop-analytics.html') return net.fetch('file://' + ANALYTICS_FILE);
        if (u.pathname === '/welcome')                        return net.fetch('file://' + WELCOME_FILE);
      }
    } catch {}
    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  });

  const win = createWindow();
  buildMenu(win);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) buildMenu(createWindow()); });
});

app.on('window-all-closed', () => { if (!IS_MAC) app.quit(); });
