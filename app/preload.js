const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('ob', {
  win: (what) => ipcRenderer.send('win', what),
  onWinState: on('win-state'),
  onOpenUrl: on('open-url'),
  onPageMenu: on('page-menu'),
  // store
  catalog: (force) => ipcRenderer.invoke('store-catalog', force),
  installed: () => ipcRenderer.invoke('store-installed'),
  install: (id) => ipcRenderer.invoke('store-install', id),
  openApp: (id) => ipcRenderer.invoke('store-open-app', id),
  // data
  db: () => ipcRenderer.invoke('db-get'),
  set: (key, value) => ipcRenderer.invoke('db-set', key, value),
  historyAdd: (url, title) => ipcRenderer.invoke('history-add', { url, title }),
  historyClear: () => ipcRenderer.invoke('history-clear'),
  // theme
  theme: () => ipcRenderer.invoke('theme-get'),
  onTheme: on('theme'),
  // shield
  onShield: on('shield-count'),
  shieldReset: (wc) => ipcRenderer.invoke('shield-reset', wc),
  // downloads
  onDownload: on('download'),
  downloadOpen: (p) => ipcRenderer.invoke('download-open', p),
  downloadShow: (p) => ipcRenderer.invoke('download-show', p),
  // local AI
  aiStatus: () => ipcRenderer.invoke('ai-status'),
  aiSummarize: (text, model) => ipcRenderer.invoke('ai-summarize', { text, model }),
  aiInstall: () => ipcRenderer.invoke('ai-install'),
  // misc
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setDefault: () => ipcRenderer.invoke('set-default'),
  isDefault: () => ipcRenderer.invoke('is-default'),
});
