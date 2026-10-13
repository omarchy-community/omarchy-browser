// Bridge for the browser's own local pages (newtab.html, reader.html) only.
// Runs in every tab (sandboxed), but exposes nothing unless the document is one of our file:// pages.
const { contextBridge, ipcRenderer } = require('electron');
const mine = /^file:\/\/.*\/(newtab|reader)\.html(#|$)/.test(location.href);
if (mine) contextBridge.exposeInMainWorld('obPage', {
  data: () => ipcRenderer.invoke('page-data'),
  fetch: (url) => ipcRenderer.invoke('page-fetch', url),
  catalog: () => ipcRenderer.invoke('store-catalog', false),
  installed: () => ipcRenderer.invoke('store-installed'),
  aiStatus: () => ipcRenderer.invoke('ai-status'),
  aiSummarize: (text, model) => ipcRenderer.invoke('ai-summarize', { text, model }),
  aiInstall: () => ipcRenderer.invoke('ai-install'),
  open: (url) => ipcRenderer.sendToHost('open', url),
  // Reader: ask the browser for the live tab's HTML (falls back to a fresh fetch if none).
  readerHtml: (url) => new Promise((res) => { ipcRenderer.once('reader-html', (_e, html) => res(html)); ipcRenderer.sendToHost('reader-ready', url); setTimeout(() => res(null), 1500); }),
});
