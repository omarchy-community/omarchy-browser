// Omarchy Browser 2.0: main process.
// Chromium (Electron) browser built for Omarchy: the Omarchy Store in a side panel,
// your Omarchy theme applied live, tracker blocking, workspaces, reader mode,
// a command palette, split view and an optional local AI (Ollama) for page summaries.
const { app, BrowserWindow, ipcMain, session, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');

const SITE = 'https://omarchystore.com/';
const PKG_RE = /^[a-z0-9@._+-]+$/;
const OMARCHY_RE = /^omarchy install [a-z0-9 '._-]+$/i;
const PARTITION = 'persist:omarchy-browser';
const THEME_FILE = path.join(os.homedir(), '.local/state/omarchy/current/theme/colors.toml');
const THEME_NAME = path.join(os.homedir(), '.local/state/omarchy/current/theme.name');

app.setName('Omarchy Browser');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
const DATA = path.join(app.getPath('userData'), 'omarchy-browser.json');

// IPC from tabs is only honoured when the sender is one of our own local pages.
const handle = (ch, fn) => ipcMain.handle(ch, guard(fn));
const LOCAL_OK = /^file:\/\/.*\/(newtab|reader)\.html(#|$)/;
const guard = (fn) => (e, ...a) => { const u = e.sender.getURL(); if (e.sender !== (win && win.webContents) && !LOCAL_OK.test(u)) throw new Error('not allowed'); return fn(e, ...a); };

// ------------------------------------------------------------- persistence ----
// One small JSON file: bookmarks, history, workspaces, settings, download log.
let db = { bookmarks: [], history: [], workspaces: [], settings: { shield: true, search: 'duckduckgo' }, downloads: [] };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DATA, 'utf8'))); } catch (_) {}
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(DATA, JSON.stringify(db)); } catch (_) {} }, 400); }
handle('db-get', () => db);
handle('db-set', (_e, key, value) => { db[key] = value; save(); return true; });
handle('history-add', (_e, { url, title }) => {
  if (!/^https?:/.test(url)) return;
  const i = db.history.findIndex((h) => h.url === url);
  const hit = i >= 0 ? db.history.splice(i, 1)[0] : { url, visits: 0 };
  hit.title = title || hit.title || url; hit.at = Date.now(); hit.visits++;
  db.history.unshift(hit);
  if (db.history.length > 3000) db.history.length = 3000;
  save();
});
handle('history-clear', () => { db.history = []; save(); });

// ------------------------------------------------------------------ theme ----
// Reads the current Omarchy theme and pushes it to the window; re-reads when the
// user changes theme (the file is swapped by omarchy-theme-set).
function readTheme() {
  const t = {};
  try {
    for (const line of fs.readFileSync(THEME_FILE, 'utf8').split('\n')) {
      const m = line.match(/^\s*([a-z_]+)\s*=\s*"(#[0-9a-fA-F]{6})"/);
      if (m) t[m[1]] = m[2];
    }
    try { t.name = fs.readFileSync(THEME_NAME, 'utf8').trim(); } catch (_) {}
  } catch (_) {}
  return t;
}
handle('theme-get', () => readTheme());
function watchTheme() {
  let last = JSON.stringify(readTheme());
  setInterval(() => {
    const now = JSON.stringify(readTheme());
    if (now !== last) { last = now; win && win.webContents.send('theme', JSON.parse(now)); }
  }, 2000);
}

// ----------------------------------------------------------------- shield ----
// Tracker and ad blocking: a compact built-in list of the networks that account
// for most tracking requests, applied to every page tab. Counted per tab.
const BLOCK = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com', 'googletagmanager.com',
  'googletagservices.com', 'adservice.google.com', 'adnxs.com', 'adsrvr.org', 'rubiconproject.com', 'pubmatic.com', 'openx.net',
  'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'scorecardresearch.com', 'quantserve.com', 'moatads.com',
  'facebook.net', 'connect.facebook.net', 'hotjar.com', 'mouseflow.com', 'fullstory.com', 'amazon-adsystem.com', 'casalemedia.com',
  'bluekai.com', 'demdex.net', 'everesttech.net', 'krxd.net', 'exelator.com', 'yieldmo.com', 'sharethrough.com', 'media.net',
  '33across.com', 'bidswitch.net', 'smartadserver.com', 'teads.tv', 'zemanta.com', 'chartbeat.com', 'newrelic.com', 'nr-data.net',
  'segment.io', 'segment.com', 'mixpanel.com', 'amplitude.com', 'branch.io', 'appsflyer.com', 'adjust.com', 'sentry.io/api',
  'ads.yahoo.com', 'analytics.yahoo.com', 'advertising.com', 'adform.net', 'adroll.com', 'bing.com/bat', 'clarity.ms',
  'tiktok.com/i18n/pixel', 'analytics.tiktok.com', 'ads.linkedin.com', 'px.ads.linkedin.com', 'snap.licdn.com', 'pinimg.com/ct',
  'ct.pinterest.com', 'ads.twitter.com', 'analytics.twitter.com', 'static.ads-twitter.com', 'cdn.onesignal.com', 'intercomcdn.com'];
const blocked = new Map(); // webContents id -> count
function isBlocked(url) {
  try { const h = new URL(url).host; return BLOCK.some((b) => b.includes('/') ? url.includes(b) : h === b || h.endsWith('.' + b)); } catch (_) { return false; }
}
function armShield(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => {
    if (db.settings.shield && d.resourceType !== 'mainFrame' && isBlocked(d.url)) {
      blocked.set(d.webContentsId, (blocked.get(d.webContentsId) || 0) + 1);
      win && win.webContents.send('shield-count', { wc: d.webContentsId, n: blocked.get(d.webContentsId) });
      return cb({ cancel: true });
    }
    cb({});
  });
  // Trim the obvious fingerprinting surface and stop sites from seeing "Electron".
  ses.webRequest.onBeforeSendHeaders((d, cb) => {
    const h = d.requestHeaders;
    if (db.settings.shield) { h['DNT'] = '1'; h['Sec-GPC'] = '1'; }
    cb({ requestHeaders: h });
  });
}
handle('shield-reset', (_e, wc) => blocked.set(wc, 0));

// -------------------------------------------------------------- downloads ----
function armDownloads(ses) {
  ses.on('will-download', (_e, item) => {
    const id = Date.now() + Math.random();
    const entry = { id, name: item.getFilename(), url: item.getURL(), total: item.getTotalBytes(), got: 0, state: 'progressing', path: '' };
    db.downloads.unshift(entry); if (db.downloads.length > 100) db.downloads.length = 100;
    const push = () => win && win.webContents.send('download', entry);
    item.on('updated', () => { entry.got = item.getReceivedBytes(); entry.total = item.getTotalBytes(); entry.state = item.isPaused() ? 'paused' : 'progressing'; push(); });
    item.once('done', (_ev, state) => { entry.state = state; entry.got = entry.total; entry.path = item.getSavePath(); push(); save(); });
    push();
  });
}
handle('download-open', (_e, p) => { if (p && fs.existsSync(p)) shell.openPath(p); });
handle('download-show', (_e, p) => { if (p && fs.existsSync(p)) shell.showItemInFolder(p); });

// ------------------------------------------------------------------ window ----
function cleanUA(ua) { return ua.replace(/ ?Electron\/[\d.]+/, '').replace(/ ?omarchy-browser\/[\d.]+/i, ''); }

function createWindow(firstUrl) {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600,
    title: 'Omarchy Browser', backgroundColor: readTheme().background || '#0d0d12', frame: false,
    icon: path.join(__dirname, 'icons', '256x256.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true, sandbox: false },
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
    const local = (f) => 'file://' + path.join(__dirname, f);
    const isLocal = [local('newtab.html'), local('reader.html')].some((u) => (params.src || '').startsWith(u));
    const ok = /^https?:|^about:blank/.test(params.src || '') || isLocal;
    if (!ok) params.src = 'about:blank';
    // Every tab gets page-preload.js (set on the <webview>), which exposes a bridge ONLY when the
    // document is one of our own file:// pages (new tab, reader). On any http(s) page it exposes nothing.
    prefs.preload = path.join(__dirname, 'page-preload.js');
  });
  if (wc.getType() === 'webview') {
    wc.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url) && win) win.webContents.send('open-url', url); return { action: 'deny' }; });
    wc.on('context-menu', (_ev, p) => win && win.webContents.send('page-menu', { wc: wc.id, x: p.x, y: p.y, link: p.linkURL, img: p.srcURL, text: p.selectionText, editable: p.isEditable, canBack: wc.canGoBack(), canFwd: wc.canGoForward() }));
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
      packages: (a.install || {}).packages || [], detect: a.detect || [], open: a.open || '',
    })),
    raw: Object.fromEntries(all.map((a) => [a.id, a])),
  };
  catalogAt = Date.now();
  return catalog;
}
handle('store-catalog', async (_e, force) => {
  const c = await getCatalog(force);
  return { categories: c.categories, hero: c.hero, apps: c.apps };
});

// Which store apps are already on this computer (pacman -Qq + commands on PATH).
handle('store-installed', async () => {
  const c = await getCatalog();
  const pk = await new Promise((res) => execFile('pacman', ['-Qq'], { maxBuffer: 8e6 }, (e, out) => res(e ? new Set() : new Set(out.split('\n')))));
  const onPath = (cmd) => process.env.PATH.split(':').some((d) => { try { fs.accessSync(path.join(d, cmd), fs.constants.X_OK); return true; } catch (_) { return false; } });
  return c.apps.filter((a) => a.packages.some((p) => pk.has(p)) || a.detect.some((d) => onPath(d))).map((a) => a.id);
});
handle('store-open-app', async (_e, id) => {
  const c = await getCatalog();
  const a = c.apps.find((x) => x.id === id);
  const cmd = a && (a.open || a.detect[0]);
  if (!cmd || !/^[A-Za-z0-9._-]+$/.test(cmd)) throw new Error('nothing to open');
  spawn(cmd, [], { detached: true, stdio: 'ignore' }).unref();
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
function terminal(script) {
  const p = spawn('omarchy-launch-floating-terminal-with-presentation', [script], { detached: true, stdio: 'ignore' });
  p.on('error', () => spawn('xdg-terminal-exec', ['bash', '-c', script + "; read -n1 -p 'Press any key to close'"], { detached: true, stdio: 'ignore' }).unref());
  p.unref();
}
handle('store-install', async (_e, id) => {
  const c = await getCatalog();
  const a = c.raw[id];
  if (!a) throw new Error('unknown app');
  const argv = recipe(a);
  if (!argv) { win && win.webContents.send('open-url', SITE + 'app/' + encodeURIComponent(id) + '/'); return { via: 'store' }; }
  terminal(`echo ${q('Installing ' + a.name + ' from the Omarchy Store…')}; echo; ${argv.map(q).join(' ')}`);
  return { via: 'terminal' };
});

// ------------------------------------------------------------- local AI ----
// If Ollama is running on this computer, page summaries come from it. Nothing is
// sent anywhere else; without Ollama the reader falls back to a built-in summary.
handle('ai-status', async () => {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(800) });
    const d = await r.json();
    return { ok: true, models: (d.models || []).map((m) => m.name) };
  } catch (_) { return { ok: false, models: [] }; }
});
handle('ai-summarize', async (_e, { text, model }) => {
  const r = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false, options: { temperature: 0.2 },
      prompt: 'Summarize this web page in 4 short bullet points, plain language, no preamble:\n\n' + String(text).slice(0, 14000) }),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error('Ollama error ' + r.status);
  return (await r.json()).response;
});
handle('ai-install', () => terminal('echo "Installing Ollama (local AI) from the Omarchy Store…"; echo; omarchy-pkg-add ollama && sudo systemctl enable --now ollama && ollama pull llama3.2:3b'));

handle('open-external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
// Fetch a page's HTML for reader view (done here so the reader page needs no network access of its own).
handle('page-fetch', async (_e, url) => {
  if (!/^https?:\/\//.test(url)) throw new Error('bad url');
  const ses = session.fromPartition(PARTITION);
  const r = await ses.fetch(url, { headers: { Accept: 'text/html,*/*;q=0.8' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await Promise.race([r.text(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
});
handle('page-data', () => ({ bookmarks: db.bookmarks.slice(0, 40), top: [...db.history].sort((a, b) => b.visits - a.visits).slice(0, 10), theme: readTheme(), shield: db.settings.shield }));
handle('set-default', () => { spawn('xdg-settings', ['set', 'default-web-browser', 'omarchy-browser.desktop'], { stdio: 'ignore' }).on('error', () => {}); });
handle('is-default', () => new Promise((res) => execFile('xdg-settings', ['get', 'default-web-browser'], (e, out) => res(!e && /omarchy-browser/.test(out)))));

app.on('second-instance', (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const url = argv.find((a) => /^https?:\/\//.test(a));
  if (url) win.webContents.send('open-url', url);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = (readTheme().mode === 'light') ? 'light' : 'dark';
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(cleanUA(ses.getUserAgent()));
  session.defaultSession.setUserAgent(cleanUA(session.defaultSession.getUserAgent()));
  armShield(ses);
  armDownloads(ses);
  watchTheme();
  createWindow(process.argv.find((a) => /^https?:\/\//.test(a)));
});
app.on('window-all-closed', () => app.quit());
