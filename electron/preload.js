'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform:   process.platform,
  getVersion: () => ipcRenderer.invoke('get-version'),
  retry:      () => ipcRenderer.send('retry'),
});
