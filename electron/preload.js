'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API to the renderer (web app JS)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // App version from package.json — useful for showing in Settings
  getVersion: () => ipcRenderer.invoke('get-version'),
});
