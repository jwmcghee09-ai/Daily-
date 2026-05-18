'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const https = require('https');

// ─── Config ──────────────────────────────────────────────────────────────────
const PROD_URL = 'https://spectre-assets.com';
const APP_URL  = process.env.SPECTRE_DEV_URL || (PROD_URL + '/dashboard');

const IS_MAC = process.platform === 'darwin';

// ─── Wake up Render before the window even opens ─────────────────────────────
// Render instances spin down after inactivity. Pinging immediately on launch
// gives the server a head start while the user sees the splash screen.
function pingServer() {
  try {
    const url = new URL(APP_URL);
    https.get({ hostname: url.hostname, path: '/api/health', timeout: 30000 }, () => {}).on('error', () => {});
  } catch { /* non-fatal */ }
}

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:    1400,
    height:   900,
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
    backgroundColor: '#e9e4f6',
    show: true,
  });

  // 1. Show branded splash instantly (local file, no network)
  win.loadFile(path.join(__dirname, 'loading.html'));

  // 2. Once splash is painted, navigate to the real app
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => win.loadURL(APP_URL), 200);
  });

  // Open external links in the OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL) || url.startsWith('about:')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Keep Stripe redirects inside the window; open everything else externally
  win.webContents.on('will-navigate', (event, url) => {
    const isApp    = url.startsWith(APP_URL) || url.startsWith('http://localhost');
    const isStripe = url.startsWith('https://billing.stripe.com') || url.startsWith('https://checkout.stripe.com');
    if (!isApp && !isStripe) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  return win;
}

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
          click: () => shell.openExternal(APP_URL),
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});

ipcMain.handle('get-version', () => app.getVersion());
