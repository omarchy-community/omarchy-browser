// Omarchy Browser: main process.
// A Chromium (Electron) browser with the Omarchy Store as a built-in side panel.
const { app, BrowserWindow, ipcMain, session, shell, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const SITE = 'https://omarchystore.com/';
const PKG_RE = /^[a-z0-9@._+-]+$/;
const OMARCHY_RE = /^omarchy install [a-z0-9 '._-]+$/i;

app.setName('Omarchy Browser');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function cleanUA(ua) {
  return ua.replace(/ ?Electron\/[\d.]+/, '').replace(/ ?omarchy-browser\/[\d.]+/i, '');
}

function createWindow(firstUrl) {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600,
    title: 'Omarchy Browser', backgroundColor: '#0d0d12', frame: false,
    icon: path.join(__dirname, 'icons', '256x256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, webviewTag: true, sandbox: false,
    },
  });
  win.loadFile('index.html');
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('maximize', () => win.webContents.send('win-state', true));
  win.on('unmaximize', () => win.webContents.send('win-state', false));
  win.on('closed', () => { win = null; });
  if (firstUrl) win.webContents.once('did-finish-load', () => win.webContents.send('open-url', firstUrl));
}

// Every page tab is a <webview>. Lock them down and turn popups into new tabs.
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (_ev, prefs, params) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    const newtab = 'file://' + path.join(__dirname, 'newtab.html');
    if (!/^https?:|^about:blank/.test(params.src || '') && params.src !== newtab) params.src = 'about:blank';
  });
  if (wc.getType() === 'webview') {
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url) && win) win.webContents.send('open-url', url);
      return { action: 'deny' };
    });
  }
});

// ---- window controls ----
ipcMain.on('win', (_e, what) => {
  if (!win) return;
  if (what === 'min') win.minimize();
  else if (what === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (what === 'close') win.close();
});

// ---- store catalog (fetched live from omarchystore.com, cached in memory) ----
let catalog = null, catalogAt = 0;
async function getCatalog(force) {
  if (!force && catalog && Date.now() - catalogAt < 3600e3) return catalog;
  const r = await fetch(SITE + 'catalog.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not reach omarchystore.com');
  const d = await r.json();
  const abs = (u) => (!u ? '' : /^https?:\/\//.test(u) ? u : SITE + u.replace(/^\//, ''));
  const all = [...(d.store_app ? [d.store_app] : []), ...(d.apps || [])];
  catalog = {
    categories: d.categories || [],
    hero: ((d.featured || {}).hero || []).map((h) => h.app),
    apps: all.map((a) => ({
      id: a.id, name: a.name, category: a.category, summary: a.summary || '',
      description: a.description || '', developer: a.developer || '', icon: abs(a.icon),
      homepage: a.homepage || '', github: a.github || '', license: a.license || '',
      method: (a.install || {}).method || '', available: a.available !== false,
    })),
    raw: Object.fromEntries(all.map((a) => [a.id, a])),
  };
  catalogAt = Date.now();
  return catalog;
}
ipcMain.handle('store-catalog', async (_e, force) => {
  const c = await getCatalog(force);
  return { categories: c.categories, hero: c.hero, apps: c.apps };
});

// Install an app the same way the Omarchy Store does: only from a recipe in the
// catalog, validated against a strict allow-list, in a visible floating terminal
// where you type your own password.
function recipe(a) {
  const inst = a.install || {};
  if (inst.method === 'pacman' || inst.method === 'aur') {
    const pk = inst.packages || [];
    if (!pk.length || !pk.every((p) => PKG_RE.test(p))) throw new Error('bad package list');
    return [inst.method === 'pacman' ? 'omarchy-pkg-add' : 'omarchy-pkg-aur-add', ...pk];
  }
  if (inst.method === 'omarchy') {
    if (!OMARCHY_RE.test(inst.command || '')) throw new Error('bad command');
    return inst.command.split(/\s+/);
  }
  return null; // release / store installs go through the Omarchy Store app
}
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
ipcMain.handle('store-install', async (_e, id) => {
  const c = await getCatalog();
  const a = c.raw[id];
  if (!a) throw new Error('unknown app');
  const argv = recipe(a);
  if (!argv) { win && win.webContents.send('open-url', SITE + 'app/' + encodeURIComponent(id) + '/'); return { via: 'store' }; }
  const script = `echo ${q('Installing ' + a.name + ' from the Omarchy Store…')}; echo; ${argv.map(q).join(' ')}`;
  const launcher = ['omarchy-launch-floating-terminal-with-presentation', script];
  const p = spawn(launcher[0], launcher.slice(1), { detached: true, stdio: 'ignore' });
  p.on('error', () => spawn('xdg-terminal-exec', ['bash', '-c', script + "; read -n1 -p 'Press any key to close'"], { detached: true, stdio: 'ignore' }).unref());
  p.unref();
  return { via: 'terminal' };
});

ipcMain.handle('open-external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });

app.on('second-instance', (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const url = argv.find((a) => /^https?:\/\//.test(a));
  if (url) win.webContents.send('open-url', url);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const ses = session.fromPartition('persist:omarchy-browser');
  ses.setUserAgent(cleanUA(ses.getUserAgent()));
  session.defaultSession.setUserAgent(cleanUA(session.defaultSession.getUserAgent()));
  createWindow(process.argv.find((a) => /^https?:\/\//.test(a)));
});
app.on('window-all-closed', () => app.quit());
