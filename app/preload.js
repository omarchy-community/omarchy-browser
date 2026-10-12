const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ob', {
  win: (what) => ipcRenderer.send('win', what),
  catalog: (force) => ipcRenderer.invoke('store-catalog', force),
  install: (id) => ipcRenderer.invoke('store-install', id),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onOpenUrl: (cb) => ipcRenderer.on('open-url', (_e, url) => cb(url)),
  onWinState: (cb) => ipcRenderer.on('win-state', (_e, max) => cb(max)),
});
