'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform:   process.platform,
  getVersion: () => ipcRenderer.invoke('get-version'),
  getTheme:   () => ipcRenderer.invoke('get-theme'),
  setTheme:   (t) => ipcRenderer.invoke('set-theme', t),
  retry:      () => ipcRenderer.send('retry'),
});
