'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
// TODO: replace with your Render custom domain or onrender.com URL
const PROD_URL = process.env.SPECTRE_URL || 'https://spectre-portfolio.onrender.com';
const DEV_URL  = 'http://localhost:3000';
const APP_URL  = app.isPackaged ? PROD_URL : DEV_URL;

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:    1400,
    height:   900,
    minWidth:  960,
    minHeight: 620,
    title: 'SPECTRE',
    // Inset titlebar on Mac so the traffic lights float over the page header
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow the session cookie from the web app to be sent
      partition: 'persist:spectre',
    },
    // Don't flash a white frame while the page loads
    show: false,
    backgroundColor: '#e9e4f6',
  });

  win.once('ready-to-show', () => win.show());

  // Open target="_blank" and external links in the OS browser, not a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL) || url.startsWith('about:')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Intercept navigations away from the app domain (e.g. Stripe redirect then back)
  win.webContents.on('will-navigate', (event, url) => {
    const isAppUrl = url.startsWith(APP_URL) || url.startsWith('http://localhost');
    const isStripe = url.startsWith('https://billing.stripe.com') || url.startsWith('https://checkout.stripe.com');
    if (!isAppUrl && !isStripe) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(APP_URL);
  return win;
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
function buildMenu(win) {
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
        { type: 'separator' },
        // Only show DevTools in dev builds
        ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'SPECTRE Web App',
          click: () => shell.openExternal(PROD_URL),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  const win = createWindow();
  buildMenu(win);

  // Re-create window on Mac when clicking the dock icon with no windows open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      buildMenu(w);
    }
  });
});

app.on('window-all-closed', () => {
  // On Mac, keep the app running in the dock until the user quits explicitly
  if (!IS_MAC) app.quit();
});

// IPC: renderer can ask for app version
ipcMain.handle('get-version', () => app.getVersion());
