'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const fs   = require('fs');

// ─── Config ──────────────────────────────────────────────────────────────────
const PROD_URL  = 'https://spectre-assets.com';
const ANALYTICS = PROD_URL + '/spectre-desktop-analytics.html';
const APP_URL   = process.env.SPECTRE_DEV_URL || ANALYTICS;
const IS_MAC    = process.platform === 'darwin';

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

// ─── Desktop CSS — injected into every SPECTRE page ──────────────────────────
const DESKTOP_CSS = `
  /* Thin purple scrollbars */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(124,77,255,.35); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(124,77,255,.55); }

  /* Strip website chrome — not needed in desktop */
  footer, .site-footer { display: none !important; }

  /* Hide the native page nav — replaced by our injected desktop nav */
  body > nav,
  body > header,
  #header { display: none !important; }

  /* Hide marketing-only sections users won't land on via desktop nav */
  [class*="pricing"], [class*="landing-hero"], [class*="cta-banner"] { display: none !important; }

  /* Reserve space for our 44px injected nav */
  body { padding-top: 44px !important; }
`;

// ─── Desktop nav bar — injected into every SPECTRE page ──────────────────────
// Runs in the renderer, so no Node.js APIs — string only.
const DESKTOP_NAV_JS = `
(function () {
  if (document.getElementById('__sn')) return; // already injected

  var IS_MAC  = navigator.platform.toUpperCase().includes('MAC');
  var PROD    = 'https://spectre-assets.com';
  var PAGES   = [
    { label: 'Analytics', path: '/spectre-desktop-analytics.html' },
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Research',  path: '/research'  },
    { label: 'Settings',  path: '/settings'  },
  ];

  var cur = location.pathname + location.search;

  function active(p) {
    return location.href.includes(p.replace(/\\/$/, ''));
  }

  // ── Nav shell ────────────────────────────────────────────────────────────────
  var nav = document.createElement('div');
  nav.id  = '__sn';
  nav.setAttribute('style', [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'height:44px',
    'z-index:2147483647',
    'background:rgba(8,6,18,.97)',
    'backdrop-filter:blur(20px)',
    '-webkit-backdrop-filter:blur(20px)',
    'border-bottom:1px solid rgba(124,77,255,.18)',
    'display:flex', 'align-items:center',
    'gap:0',
    'padding:0 16px',
    IS_MAC ? 'padding-left:82px' : '',
    '-webkit-app-region:drag',
    'user-select:none',
    'font-family:"Space Grotesk",-apple-system,sans-serif',
  ].filter(Boolean).join(';'));

  // ── Wordmark ─────────────────────────────────────────────────────────────────
  var logo = document.createElement('span');
  logo.setAttribute('style', [
    'font-size:.68rem', 'font-weight:800', 'letter-spacing:.24em',
    'background:linear-gradient(90deg,#7c4dff 0%,#d946ef 50%,#ff7a30 100%)',
    '-webkit-background-clip:text', '-webkit-text-fill-color:transparent',
    'background-clip:text',
    'margin-right:20px', 'flex-shrink:0',
  ].join(';'));
  logo.textContent = 'SPECTRE';
  nav.appendChild(logo);

  // ── Nav links ─────────────────────────────────────────────────────────────────
  var linkWrap = document.createElement('div');
  linkWrap.setAttribute('style', '-webkit-app-region:no-drag;display:flex;gap:2px;flex:1;align-items:center;');

  PAGES.forEach(function (p) {
    var on = active(p.path);
    var a = document.createElement('a');
    a.href = PROD + p.path;
    a.textContent = p.label;
    a.setAttribute('style', [
      'padding:4px 12px',
      'border-radius:6px',
      'font-size:.71rem', 'font-weight:600', 'letter-spacing:.03em',
      'text-decoration:none',
      'transition:background .14s,color .14s',
      on ? 'color:#fff;background:rgba(124,77,255,.28)' : 'color:#7a7499;background:transparent',
    ].join(';'));
    a.addEventListener('mouseenter', function () {
      if (!active(p.path)) { this.style.background = 'rgba(124,77,255,.12)'; this.style.color = '#ccc5f0'; }
    });
    a.addEventListener('mouseleave', function () {
      if (!active(p.path)) { this.style.background = 'transparent'; this.style.color = '#7a7499'; }
    });
    linkWrap.appendChild(a);
  });
  nav.appendChild(linkWrap);

  // ── Right cluster ─────────────────────────────────────────────────────────────
  var right = document.createElement('div');
  right.setAttribute('style', '-webkit-app-region:no-drag;display:flex;align-items:center;gap:8px;');

  var refreshBtn = document.createElement('button');
  refreshBtn.id = '__sn-refresh';
  refreshBtn.textContent = '↺';
  refreshBtn.title = 'Refresh';
  refreshBtn.setAttribute('style', [
    'background:rgba(124,77,255,.12)',
    'border:1px solid rgba(124,77,255,.22)',
    'border-radius:6px',
    'color:#9890b8', 'cursor:pointer',
    'width:28px', 'height:28px',
    'font-size:.95rem', 'line-height:1',
    'display:flex', 'align-items:center', 'justify-content:center',
    'transition:all .14s',
    'padding:0',
  ].join(';'));
  refreshBtn.addEventListener('mouseenter', function () {
    this.style.background = 'rgba(124,77,255,.25)';
    this.style.color = '#fff';
  });
  refreshBtn.addEventListener('mouseleave', function () {
    this.style.background = 'rgba(124,77,255,.12)';
    this.style.color = '#9890b8';
  });
  refreshBtn.addEventListener('click', function () { location.reload(); });
  right.appendChild(refreshBtn);

  var ver = document.createElement('span');
  ver.id = '__sn-ver';
  ver.setAttribute('style', 'font-family:"DM Mono","Courier New",monospace;font-size:.56rem;color:#3d3860;letter-spacing:.1em;');
  ver.textContent = '';
  right.appendChild(ver);

  nav.appendChild(right);
  document.body.prepend(nav);

  // ── Fetch version from Electron ───────────────────────────────────────────────
  if (window.electronAPI && typeof window.electronAPI.getVersion === 'function') {
    window.electronAPI.getVersion().then(function (v) {
      var el = document.getElementById('__sn-ver');
      if (el) el.textContent = 'v' + v;
    }).catch(function () {});
  }
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
    trafficLightPosition: IS_MAC ? { x: 16, y: 14 } : undefined,
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

  // ── Inject desktop chrome on every SPECTRE page ───────────────────────────────
  const savedZoom = loadZoom();
  win.webContents.on('did-finish-load', () => {
    if (savedZoom !== 1) win.webContents.setZoomFactor(savedZoom);
    const url = win.webContents.getURL();
    if (url.startsWith(PROD_URL)) {
      win.webContents.insertCSS(DESKTOP_CSS).catch(() => {});
      win.webContents.executeJavaScript(DESKTOP_NAV_JS).catch(() => {});
    }
  });

  win.webContents.on('zoom-changed', (_, direction) => {
    const next = Math.min(Math.max(
      win.webContents.getZoomFactor() + (direction === 'in' ? 0.1 : -0.1),
      0.5), 3.0);
    win.webContents.setZoomFactor(next);
    saveZoom(next);
  });

  // ── Error page ────────────────────────────────────────────────────────────────
  win.webContents.on('did-fail-load', (_, errorCode) => {
    if (errorCode === -3) return;
    win.loadFile(path.join(__dirname, 'error.html'));
  });

  // ── External links ────────────────────────────────────────────────────────────
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(PROD_URL) || url.startsWith('about:')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    // Redirect marketing root to analytics
    if (url === PROD_URL || url === PROD_URL + '/') {
      event.preventDefault();
      win.loadURL(ANALYTICS);
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
  const nav = (url) => () => win.loadURL(url);
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
        { label: 'Analytics',  accelerator: IS_MAC ? 'Cmd+1' : 'Ctrl+1', click: nav(ANALYTICS) },
        { label: 'Dashboard',  accelerator: IS_MAC ? 'Cmd+2' : 'Ctrl+2', click: nav(PROD_URL + '/dashboard') },
        { label: 'Research',   accelerator: IS_MAC ? 'Cmd+3' : 'Ctrl+3', click: nav(PROD_URL + '/research') },
        { label: 'Settings',   accelerator: IS_MAC ? 'Cmd+4' : 'Ctrl+4', click: nav(PROD_URL + '/settings') },
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
  const win = createWindow();
  buildMenu(win);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      buildMenu(w);
    }
  });
});

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});
